const XLSX = require('xlsx');
const { PrismaClient } = require("@prisma/client");
const { createProduct } = require("./product.service");

const prisma = new PrismaClient();

/**
 * Process bulk product upload from Excel file
 * Following existing TSLogix patterns and validation
 */
async function processBulkProductUpload(fileBuffer, userId, userRole) {
  const startTime = Date.now();
  console.log(`📊 BULK PRODUCT: Starting bulk processing at ${new Date().toISOString()}`);

  try {
    // 1. Parse Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const validationResult = await validateExcelStructure(workbook);

    if (!validationResult.isValid) {
      return {
        success: false,
        message: 'Excel validation failed',
        errors: validationResult.errors,
        processing_time_ms: Date.now() - startTime
      };
    }

    // 2. Extract and validate data
    const products = validationResult.data;

    // 3. Check for duplicates and validate data
    const validationErrors = await validateProductData(products);
    if (validationErrors.length > 0) {
      return {
        success: false,
        message: 'Product validation failed',
        errors: validationErrors,
        processing_time_ms: Date.now() - startTime
      };
    }

    // 4. Process products in batches
    const result = await processProductsInBatches(products, userId, userRole);

    console.log(`✅ BULK PRODUCT: Completed processing ${result.successCount} successful, ${result.errorCount} failed`);

    return {
      success: result.errorCount === 0,
      message: `Successfully processed ${result.successCount} out of ${products.length} products`,
      data: {
        successCount: result.successCount,
        errorCount: result.errorCount,
        errors: result.errors
      },
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('❌ Error in bulk product processing:', error);
    return {
      success: false,
      message: 'Bulk processing failed',
      error: error.message,
      processing_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Validate Excel file structure and data
 */
async function validateExcelStructure(workbook) {
  const errors = [];

  try {
    // Check if 'Products' sheet exists
    const sheetNames = workbook.SheetNames;
    if (!sheetNames.includes('Products')) {
      errors.push('Missing required sheet: Products');
      return { isValid: false, errors };
    }

    // Parse Products sheet
    const productsSheet = workbook.Sheets['Products'];
    const products = XLSX.utils.sheet_to_json(productsSheet);

    if (products.length === 0) {
      errors.push('Products sheet is empty');
      return { isValid: false, errors };
    }

    // Validate required columns
    const requiredColumns = [
      'Product Name',
      'Manufacturer'
    ];

    const firstRow = products[0];
    for (const column of requiredColumns) {
      if (!firstRow.hasOwnProperty(column)) {
        errors.push(`Missing required column: ${column}`);
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Transform data to match our schema
    const transformedProducts = await transformProductData(products);

    return {
      isValid: true,
      data: transformedProducts
    };

  } catch (error) {
    console.error('❌ Error validating Excel structure:', error);
    return {
      isValid: false,
      errors: [`Excel parsing error: ${error.message}`]
    };
  }
}

/**
 * Transform Excel data to match our product schema
 */
async function transformProductData(excelProducts) {
  const transformedProducts = [];

  // Get reference data for lookups
  const [categories, subcategories1, subcategories2, temperatureRanges] = await Promise.all([
    prisma.productCategory.findMany(),
    prisma.productSubCategory1.findMany(),
    prisma.productSubCategory2.findMany(),
    prisma.temperatureRange.findMany()
  ]);

  for (const row of excelProducts) {
    const product = {
      name: row['Product Name']?.trim() || '',
      product_code: row['Product Code']?.trim() || null, // Will be auto-generated if empty
      manufacturer: row['Manufacturer']?.trim() || '',
      humidity: row['Humidity']?.toString()?.trim() || null,
      observations: row['Observations']?.trim() || null,

      // Category lookups
      category_id: findCategoryId(row['Category'], categories),
      subcategory1_id: findSubcategory1Id(row['Subcategory 1'], subcategories1),
      subcategory2_id: findSubcategory2Id(row['Subcategory 2'], subcategories2),
      temperature_range_id: findTemperatureRangeId(row['Temperature Range'], temperatureRanges),

      // Store original names for validation error reporting
      category_name: row['Category']?.trim() || null,
      subcategory1_name: row['Subcategory 1']?.trim() || null,
      subcategory2_name: row['Subcategory 2']?.trim() || null,
      temperature_range_name: row['Temperature Range']?.trim() || null,

      // Excel row reference for error reporting
      _row_number: excelProducts.indexOf(row) + 2 // +2 because Excel is 1-indexed and has header
    };

    transformedProducts.push(product);
  }

  return transformedProducts;
}

/**
 * Find category ID by name (case-insensitive)
 */
function findCategoryId(categoryName, categories) {
  if (!categoryName) return null;
  const category = categories.find(cat =>
    cat.name.toLowerCase() === categoryName.toLowerCase()
  );
  return category ? category.category_id : null;
}

/**
 * Find subcategory1 ID by name (case-insensitive)
 */
function findSubcategory1Id(subcategoryName, subcategories) {
  if (!subcategoryName) return null;
  const subcategory = subcategories.find(sub =>
    sub.name.toLowerCase() === subcategoryName.toLowerCase()
  );
  return subcategory ? subcategory.subcategory1_id : null;
}

/**
 * Find subcategory2 ID by name (case-insensitive)
 */
function findSubcategory2Id(subcategoryName, subcategories) {
  if (!subcategoryName) return null;
  const subcategory = subcategories.find(sub =>
    sub.name.toLowerCase() === subcategoryName.toLowerCase()
  );
  return subcategory ? subcategory.subcategory2_id : null;
}

/**
 * Find temperature range ID by range string (case-insensitive)
 */
function findTemperatureRangeId(rangeName, temperatureRanges) {
  if (!rangeName) return null;
  const range = temperatureRanges.find(tr =>
    tr.range.toLowerCase() === rangeName.toLowerCase()
  );
  return range ? range.temperature_range_id : null;
}

/**
 * Validate product data before processing
 */
async function validateProductData(products) {
  const errors = [];
  const processedCodes = new Set();

  for (const product of products) {
    const rowErrors = [];

    // Required field validation
    if (!product.name || product.name.trim() === '') {
      rowErrors.push('Product Name is required and cannot be empty');
    } else if (product.name.trim().length < 2) {
      rowErrors.push('Product Name must be at least 2 characters long');
    }

    if (!product.manufacturer || product.manufacturer.trim() === '') {
      rowErrors.push('Manufacturer is required and cannot be empty');
    } else if (product.manufacturer.trim().length < 2) {
      rowErrors.push('Manufacturer must be at least 2 characters long');
    }

    // Product code validation
    if (product.product_code) {
      const trimmedCode = product.product_code.trim();

      // Check for duplicates in current batch
      if (processedCodes.has(trimmedCode)) {
        rowErrors.push(`Duplicate Product Code "${trimmedCode}" found in this batch`);
      } else {
        processedCodes.add(trimmedCode);

        // Check if product code already exists in database
        const existingProduct = await prisma.product.findUnique({
          where: { product_code: trimmedCode }
        });
        if (existingProduct) {
          rowErrors.push(`Product Code "${trimmedCode}" already exists in database`);
        }
      }
    }

    // Category validation - ensure category exists if provided
    if (product.category_id === null && product.category_name) {
      rowErrors.push(`Category "${product.category_name}" not found. Check Categories sheet for valid values.`);
    }

    // Subcategory validation
    if (product.subcategory1_id === null && product.subcategory1_name) {
      rowErrors.push(`Subcategory 1 "${product.subcategory1_name}" not found. Check Subcategories1 sheet for valid values.`);
    }

    if (product.subcategory2_id === null && product.subcategory2_name) {
      rowErrors.push(`Subcategory 2 "${product.subcategory2_name}" not found. Check Subcategories2 sheet for valid values.`);
    }

    // Temperature range validation
    if (product.temperature_range_id === null && product.temperature_range_name) {
      rowErrors.push(`Temperature Range "${product.temperature_range_name}" not found. Check Temperature_Ranges sheet for valid values.`);
    }

    if (rowErrors.length > 0) {
      errors.push({
        row: product._row_number,
        product_code: product.product_code || product.name,
        error: rowErrors.join('; ')
      });
    }
  }

  return errors;
}

/**
 * Process products in batches to avoid memory issues
 */
async function processProductsInBatches(products, userId, userRole) {
  const batchSize = 10;
  const result = {
    successCount: 0,
    errorCount: 0,
    errors: []
  };

  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);

    for (const productData of batch) {
      try {
        // Remove row number and original names before creating product
        const {
          _row_number,
          category_name,
          subcategory1_name,
          subcategory2_name,
          temperature_range_name,
          ...cleanProductData
        } = productData;

        await createProduct(cleanProductData, userId, userRole);
        result.successCount++;

        console.log(`✅ Created product: ${productData.name} (row ${_row_number})`);
      } catch (error) {
        result.errorCount++;
        result.errors.push({
          row: productData._row_number,
          product_code: productData.product_code || productData.name,
          error: error.message
        });

        console.error(`❌ Failed to create product ${productData.name}:`, error.message);
      }
    }

    // Small delay between batches to avoid overwhelming the database
    if (i + batchSize < products.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return result;
}

/**
 * Generate Excel template for bulk product upload - matches working entry template pattern
 */
async function generateProductTemplate() {
  try {
    console.log('🔧 Starting product template generation...');

    // Get reference data for the template
    const [categories, subcategories1, subcategories2, temperatureRanges] = await Promise.all([
      prisma.productCategory.findMany({ orderBy: { name: 'asc' } }),
      prisma.productSubCategory1.findMany({ orderBy: { name: 'asc' } }),
      prisma.productSubCategory2.findMany({ orderBy: { name: 'asc' } }),
      prisma.temperatureRange.findMany({ orderBy: { range: 'asc' } })
    ]);

    console.log(`📊 Template data loaded: ${categories.length} categories, ${subcategories1.length} subcategories1, ${subcategories2.length} subcategories2, ${temperatureRanges.length} temperature ranges`);

    // Create workbook with multiple sheets - following working entry template pattern
    const workbook = XLSX.utils.book_new();

    // INSTRUCTIONS SHEET FIRST - User guide (matching entry template structure)
    const instructions = [
      { Step: 1, Instruction: 'Fill out the Products sheet with product information' },
      { Step: 2, Instruction: 'Use EXACT names from the reference sheets (Categories, Subcategories, etc.)' },
      { Step: 3, Instruction: 'Product Name and Manufacturer are required fields' },
      { Step: 4, Instruction: 'Product codes must be unique or leave blank for auto-generation' },
      { Step: 5, Instruction: 'Category names must match exactly from Categories sheet' },
      { Step: 6, Instruction: 'Subcategory names must match exactly from respective sheets' },
      { Step: 7, Instruction: 'Temperature ranges must match exactly from Temperature_Ranges sheet' },
      { Step: 8, Instruction: 'Delete example rows before uploading your data' },
      { Step: 9, Instruction: 'Upload the completed file to the bulk upload page' },
      { Step: 10, Instruction: 'Document uploads not supported via Excel - add manually after import' }
    ];

    // MAIN PRODUCTS SHEET - Using safe fallbacks with comprehensive examples
    const productsData = [
      {
        'Product Name': 'Paracetamol 500mg',
        'Product Code': 'PRD-001',
        'Manufacturer': 'Pfizer',
        'Category': categories.length > 0 ? categories[0].name : 'Medicamentos',
        'Subcategory 1': subcategories1.length > 0 ? subcategories1[0].name : 'Analgesicos',
        'Subcategory 2': subcategories2.length > 0 ? subcategories2[0].name : 'Tabletas',
        'Temperature Range': temperatureRanges.length > 0 ? temperatureRanges[0].range : '15-25°C',
        'Humidity': '60%',
        'Observations': 'Store in dry place away from direct sunlight'
      },
      {
        'Product Name': 'Vitamina C 1000mg',
        'Product Code': '',
        'Manufacturer': 'Johnson & Johnson',
        'Category': categories.length > 1 ? categories[1].name : 'Suplementos',
        'Subcategory 1': '',
        'Subcategory 2': '',
        'Temperature Range': temperatureRanges.length > 1 ? temperatureRanges[1].range : '2-8°C',
        'Humidity': '',
        'Observations': ''
      }
    ];

    // Add main sheets in the same order as working entry template
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructions), 'Instructions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsData), 'Products');

    // Reference data sheets with robust error handling - matching entry template pattern
    console.log('📋 Adding reference data sheets...');

    try {
      // Categories reference sheet
      const categoriesData = categories.length > 0 ?
        categories.map(cat => ({
          Name: cat.name || 'Unknown',
          Description: cat.description || 'N/A'
        })) :
        [
          { Name: 'Medicamentos', Description: 'Pharmaceutical products' },
          { Name: 'Suplementos', Description: 'Health supplements' },
          { Name: 'Dispositivos', Description: 'Medical devices' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categoriesData), 'Categories');

      // Subcategories1 reference sheet
      const subcategories1Data = subcategories1.length > 0 ?
        subcategories1.map(sub => ({
          Name: sub.name || 'Unknown',
          Description: sub.description || 'N/A'
        })) :
        [
          { Name: 'Analgesicos', Description: 'Pain relief medications' },
          { Name: 'Antibioticos', Description: 'Antibiotic medications' },
          { Name: 'Vitaminas', Description: 'Vitamin supplements' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subcategories1Data), 'Subcategories1');

      // Subcategories2 reference sheet
      const subcategories2Data = subcategories2.length > 0 ?
        subcategories2.map(sub => ({
          Name: sub.name || 'Unknown',
          Description: sub.description || 'N/A'
        })) :
        [
          { Name: 'Tabletas', Description: 'Tablet form' },
          { Name: 'Capsulas', Description: 'Capsule form' },
          { Name: 'Jarabe', Description: 'Syrup form' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subcategories2Data), 'Subcategories2');

      // Temperature ranges reference sheet
      const tempRangesData = temperatureRanges.length > 0 ?
        temperatureRanges.map(tr => ({
          Range: tr.range || 'Unknown',
          'Min Celsius': tr.min_celsius || '',
          'Max Celsius': tr.max_celsius || '',
          Description: `${tr.min_celsius || 'N/A'}°C to ${tr.max_celsius || 'N/A'}°C`
        })) :
        [
          { Range: '15-25°C', 'Min Celsius': '15', 'Max Celsius': '25', Description: 'Room temperature storage' },
          { Range: '2-8°C', 'Min Celsius': '2', 'Max Celsius': '8', Description: 'Refrigerated storage' },
          { Range: 'Ambiente', 'Min Celsius': '15', 'Max Celsius': '30', Description: 'Ambient temperature' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tempRangesData), 'Temperature_Ranges');

      console.log('✅ Reference data sheets added successfully');
    } catch (sheetError) {
      console.error('❌ Error adding reference sheets:', sheetError);
      // Add minimal fallback sheets to prevent corruption
      const fallbackData = [{ Error: 'Failed to load reference data', Contact: 'Administrator' }];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Categories');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Subcategories1');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Subcategories2');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Temperature_Ranges');
    }

    // Field reference sheet for detailed field information
    const fieldReference = [
      { Field: 'Product Name', Required: 'YES', Example: 'Paracetamol 500mg', Description: 'Full product name including dosage if applicable' },
      { Field: 'Product Code', Required: 'NO', Example: 'PRD-001 or blank', Description: 'Unique product code. Leave empty for auto-generation (format: PRD-XXXXXXXX)' },
      { Field: 'Manufacturer', Required: 'YES', Example: 'Pfizer', Description: 'Product manufacturer or brand name' },
      { Field: 'Category', Required: 'NO', Example: 'Medicamentos', Description: 'Product category - must match EXACTLY with Categories sheet values' },
      { Field: 'Subcategory 1', Required: 'NO', Example: 'Analgesicos', Description: 'Product subcategory level 1 - must match EXACTLY with Subcategories1 sheet values' },
      { Field: 'Subcategory 2', Required: 'NO', Example: 'Tabletas', Description: 'Product subcategory level 2 - must match EXACTLY with Subcategories2 sheet values' },
      { Field: 'Temperature Range', Required: 'NO', Example: '15-25°C', Description: 'Storage temperature range - must match EXACTLY with Temperature_Ranges sheet values' },
      { Field: 'Humidity', Required: 'NO', Example: '60% or 45-65%', Description: 'Storage humidity requirements' },
      { Field: 'Observations', Required: 'NO', Example: 'Store in dry place', Description: 'Additional notes, special handling instructions, or remarks' }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fieldReference), 'Field_Reference');

    // Important notes sheet
    const importantNotes = [
      { Note: 'CRITICAL REQUIREMENTS', Detail: 'Sheet MUST be named "Products" (case-sensitive)' },
      { Note: 'NAMING CONVENTION', Detail: 'Category names are case-insensitive but must match reference data exactly' },
      { Note: 'UNIQUENESS', Detail: 'Product codes must be unique across the system - duplicates will be rejected' },
      { Note: 'VALIDATION', Detail: 'All data will be validated against existing system records' },
      { Note: 'LIMITATIONS', Detail: 'Document uploads not supported via Excel - add manually after import' },
      { Note: 'PREPARATION', Detail: 'Delete all example rows before uploading your actual data' },
      { Note: 'TESTING', Detail: 'Test with a small batch first before uploading large datasets' },
      { Note: 'SUPPORT', Detail: 'Contact system administrator if you encounter validation errors' }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importantNotes), 'Important_Notes');

    // Generate buffer with explicit settings matching working entry template
    console.log('📝 Generating Excel buffer...');
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    });

    if (!buffer || buffer.length === 0) {
      throw new Error('Generated buffer is empty or invalid');
    }

    console.log(`✅ Product template generated successfully. Buffer size: ${buffer.length} bytes, Sheets: ${workbook.SheetNames.length}`);

    return {
      success: true,
      buffer: buffer,
      filename: `product_bulk_upload_template_${new Date().toISOString().split('T')[0]}.xlsx`
    };

  } catch (error) {
    console.error('❌ Error generating product template:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  processBulkProductUpload,
  generateProductTemplate
};