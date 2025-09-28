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
 * Generate Excel template for bulk product upload
 */
async function generateProductTemplate() {
  try {
    // Get reference data for the template
    const [categories, subcategories1, subcategories2, temperatureRanges] = await Promise.all([
      prisma.productCategory.findMany({ orderBy: { name: 'asc' } }),
      prisma.productSubCategory1.findMany({ orderBy: { name: 'asc' } }),
      prisma.productSubCategory2.findMany({ orderBy: { name: 'asc' } }),
      prisma.temperatureRange.findMany({ orderBy: { range: 'asc' } })
    ]);

    // Create workbook with proper settings
    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "TSLogix Product Bulk Upload Template",
      Subject: "Product Bulk Upload",
      Author: "TSLogix System",
      CreatedDate: new Date()
    };

    // Main Products sheet - simplified structure
    const productsData = [
      {
        'Product Name': 'Example Product 1',
        'Product Code': 'PRD-001',
        'Manufacturer': 'Example Manufacturer',
        'Category': categories.length > 0 ? categories[0].name : '',
        'Subcategory 1': subcategories1.length > 0 ? subcategories1[0].name : '',
        'Subcategory 2': subcategories2.length > 0 ? subcategories2[0].name : '',
        'Temperature Range': temperatureRanges.length > 0 ? temperatureRanges[0].range : '',
        'Humidity': '60%',
        'Observations': 'Example observations'
      },
      {
        'Product Name': 'Example Product 2',
        'Product Code': '',
        'Manufacturer': 'Another Manufacturer',
        'Category': categories.length > 1 ? categories[1].name : '',
        'Subcategory 1': '',
        'Subcategory 2': '',
        'Temperature Range': temperatureRanges.length > 1 ? temperatureRanges[1].range : '',
        'Humidity': '',
        'Observations': ''
      }
    ];

    const productsSheet = XLSX.utils.json_to_sheet(productsData);
    XLSX.utils.book_append_sheet(workbook, productsSheet, 'Products');

    // Reference data sheets - always add even if empty
    const categoriesSheet = XLSX.utils.json_to_sheet(
      categories.length > 0 ?
      categories.map(cat => ({ Name: cat.name, Description: cat.description || '' })) :
      [{ Name: 'No categories available', Description: '' }]
    );
    XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');

    const subcategories1Sheet = XLSX.utils.json_to_sheet(
      subcategories1.length > 0 ?
      subcategories1.map(sub => ({ Name: sub.name, Description: sub.description || '' })) :
      [{ Name: 'No subcategories available', Description: '' }]
    );
    XLSX.utils.book_append_sheet(workbook, subcategories1Sheet, 'Subcategories1');

    const subcategories2Sheet = XLSX.utils.json_to_sheet(
      subcategories2.length > 0 ?
      subcategories2.map(sub => ({ Name: sub.name, Description: sub.description || '' })) :
      [{ Name: 'No subcategories available', Description: '' }]
    );
    XLSX.utils.book_append_sheet(workbook, subcategories2Sheet, 'Subcategories2');

    const tempRangesSheet = XLSX.utils.json_to_sheet(
      temperatureRanges.length > 0 ?
      temperatureRanges.map(tr => ({
        Range: tr.range,
        'Min Celsius': tr.min_celsius,
        'Max Celsius': tr.max_celsius
      })) :
      [{ Range: 'No temperature ranges available', 'Min Celsius': '', 'Max Celsius': '' }]
    );
    XLSX.utils.book_append_sheet(workbook, tempRangesSheet, 'Temperature_Ranges');

    // Instructions sheet with detailed guidance
    const instructionsData = [
      { Field: 'Product Name', Required: 'YES', Description: 'Name of the product (e.g., "Paracetamol 500mg")' },
      { Field: 'Product Code', Required: 'NO', Description: 'Unique product code. Leave empty for auto-generation (format: PRD-XXXXXXXX)' },
      { Field: 'Manufacturer', Required: 'YES', Description: 'Product manufacturer name (e.g., "Pfizer", "Johnson & Johnson")' },
      { Field: 'Category', Required: 'NO', Description: 'Product category - must match EXACTLY with Categories sheet values' },
      { Field: 'Subcategory 1', Required: 'NO', Description: 'Product subcategory level 1 - must match EXACTLY with Subcategories1 sheet values' },
      { Field: 'Subcategory 2', Required: 'NO', Description: 'Product subcategory level 2 - must match EXACTLY with Subcategories2 sheet values' },
      { Field: 'Temperature Range', Required: 'NO', Description: 'Storage temperature range - must match EXACTLY with Temperature_Ranges sheet values' },
      { Field: 'Humidity', Required: 'NO', Description: 'Storage humidity requirements (e.g., "60%", "45-65%")' },
      { Field: 'Observations', Required: 'NO', Description: 'Additional notes, special handling instructions, or remarks' },
      { Field: 'IMPORTANT NOTES', Required: '', Description: '1. Sheet MUST be named "Products" (case-sensitive)' },
      { Field: '', Required: '', Description: '2. Category names are case-insensitive but must match reference data' },
      { Field: '', Required: '', Description: '3. Product codes must be unique - duplicates will be rejected' },
      { Field: '', Required: '', Description: '4. Document uploads not supported via Excel - add manually after import' },
      { Field: '', Required: '', Description: '5. Delete example rows before uploading your data' }
    ];

    const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData);
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

    // Generate buffer with explicit settings
    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      compression: true
    });

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