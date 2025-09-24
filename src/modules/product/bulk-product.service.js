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

  for (const product of products) {
    const rowErrors = [];

    // Required field validation
    if (!product.name || product.name.trim() === '') {
      rowErrors.push('Product Name is required');
    }

    if (!product.manufacturer || product.manufacturer.trim() === '') {
      rowErrors.push('Manufacturer is required');
    }

    // Check for duplicate product codes in this batch
    if (product.product_code) {
      const duplicate = products.find(p =>
        p.product_code === product.product_code && p._row_number !== product._row_number
      );
      if (duplicate) {
        rowErrors.push(`Duplicate Product Code in row ${duplicate._row_number}`);
      }

      // Check if product code already exists in database
      const existingProduct = await prisma.product.findUnique({
        where: { product_code: product.product_code }
      });
      if (existingProduct) {
        rowErrors.push(`Product Code "${product.product_code}" already exists in database`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({
        row: product._row_number,
        product_code: product.product_code || product.name,
        error: rowErrors.join(', ')
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
        // Remove row number before creating product
        const { _row_number, ...cleanProductData } = productData;

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

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Main Products sheet
    const productsData = [
      {
        'Product Name': 'Example Product 1',
        'Product Code': 'PRD-001',
        'Manufacturer': 'Example Manufacturer',
        'Category': categories.length > 0 ? categories[0].name : 'Example Category',
        'Subcategory 1': subcategories1.length > 0 ? subcategories1[0].name : 'Example Subcategory 1',
        'Subcategory 2': subcategories2.length > 0 ? subcategories2[0].name : 'Example Subcategory 2',
        'Temperature Range': temperatureRanges.length > 0 ? temperatureRanges[0].range : '2-8°C',
        'Humidity': '60%',
        'Observations': 'Example observations'
      }
    ];

    const productsSheet = XLSX.utils.json_to_sheet(productsData);
    XLSX.utils.book_append_sheet(workbook, productsSheet, 'Products');

    // Reference data sheets
    if (categories.length > 0) {
      const categoriesSheet = XLSX.utils.json_to_sheet(
        categories.map(cat => ({ Name: cat.name, Description: cat.description || '' }))
      );
      XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');
    }

    if (subcategories1.length > 0) {
      const subcategories1Sheet = XLSX.utils.json_to_sheet(
        subcategories1.map(sub => ({ Name: sub.name, Description: sub.description || '' }))
      );
      XLSX.utils.book_append_sheet(workbook, subcategories1Sheet, 'Subcategories1');
    }

    if (subcategories2.length > 0) {
      const subcategories2Sheet = XLSX.utils.json_to_sheet(
        subcategories2.map(sub => ({ Name: sub.name, Description: sub.description || '' }))
      );
      XLSX.utils.book_append_sheet(workbook, subcategories2Sheet, 'Subcategories2');
    }

    if (temperatureRanges.length > 0) {
      const tempRangesSheet = XLSX.utils.json_to_sheet(
        temperatureRanges.map(tr => ({
          Range: tr.range,
          'Min Celsius': tr.min_celsius,
          'Max Celsius': tr.max_celsius
        }))
      );
      XLSX.utils.book_append_sheet(workbook, tempRangesSheet, 'Temperature_Ranges');
    }

    // Instructions sheet
    const instructionsData = [
      { Field: 'Product Name', Required: 'Yes', Description: 'Name of the product' },
      { Field: 'Product Code', Required: 'No', Description: 'Unique product code (auto-generated if empty)' },
      { Field: 'Manufacturer', Required: 'Yes', Description: 'Product manufacturer' },
      { Field: 'Category', Required: 'No', Description: 'Product category (see Categories sheet)' },
      { Field: 'Subcategory 1', Required: 'No', Description: 'Product subcategory level 1 (see Subcategories1 sheet)' },
      { Field: 'Subcategory 2', Required: 'No', Description: 'Product subcategory level 2 (see Subcategories2 sheet)' },
      { Field: 'Temperature Range', Required: 'No', Description: 'Storage temperature range (see Temperature_Ranges sheet)' },
      { Field: 'Humidity', Required: 'No', Description: 'Storage humidity requirements' },
      { Field: 'Observations', Required: 'No', Description: 'Additional notes or observations' }
    ];

    const instructionsSheet = XLSX.utils.json_to_sheet(instructionsData);
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

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