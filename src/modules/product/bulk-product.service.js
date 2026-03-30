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
    // Check if 'Productos' sheet exists
    const sheetNames = workbook.SheetNames;
    if (!sheetNames.includes('Productos')) {
      errors.push('Falta la hoja requerida: Productos');
      return { isValid: false, errors };
    }

    // Parse Products sheet
    const productsSheet = workbook.Sheets['Productos'];
    const products = XLSX.utils.sheet_to_json(productsSheet);

    if (products.length === 0) {
      errors.push('La hoja Productos está vacía');
      return { isValid: false, errors };
    }

    // Validate required columns
    const requiredColumns = [
      'Nombre del Producto',
      'Fabricante'
    ];

    const firstRow = products[0];
    for (const column of requiredColumns) {
      if (!firstRow.hasOwnProperty(column)) {
        errors.push(`Falta la columna requerida: ${column}`);
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
      name: row['Nombre del Producto']?.trim() || '',
      product_code: row['Código de Producto']?.trim() || null, // Will be auto-generated if empty
      manufacturer: row['Fabricante']?.trim() || '',
      humidity: row['Humedad']?.toString()?.trim() || null,
      observations: row['Observaciones']?.trim() || null,

      // Category lookups
      category_id: findCategoryId(row['Categoría'], categories),
      subcategory1_id: findSubcategory1Id(row['Subcategoría 1'], subcategories1),
      subcategory2_id: findSubcategory2Id(row['Subcategoría 2'], subcategories2),
      temperature_range_id: findTemperatureRangeId(row['Rango de Temperatura'], temperatureRanges),

      // Store original names for validation error reporting
      category_name: row['Categoría']?.trim() || null,
      subcategory1_name: row['Subcategoría 1']?.trim() || null,
      subcategory2_name: row['Subcategoría 2']?.trim() || null,
      temperature_range_name: row['Rango de Temperatura']?.trim() || null,

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
      rowErrors.push('El Nombre del Producto es obligatorio y no puede estar vacío');
    } else if (product.name.trim().length < 2) {
      rowErrors.push('El Nombre del Producto debe tener al menos 2 caracteres');
    }

    if (!product.manufacturer || product.manufacturer.trim() === '') {
      rowErrors.push('El Fabricante es obligatorio y no puede estar vacío');
    } else if (product.manufacturer.trim().length < 2) {
      rowErrors.push('El Fabricante debe tener al menos 2 caracteres');
    }

    // Product code validation
    if (product.product_code) {
      const trimmedCode = product.product_code.trim();

      // Check for duplicates in current batch
      if (processedCodes.has(trimmedCode)) {
        rowErrors.push(`Código de Producto duplicado "${trimmedCode}" encontrado en este lote`);
      } else {
        processedCodes.add(trimmedCode);

        // Check if product code already exists in database
        const existingProduct = await prisma.product.findUnique({
          where: { product_code: trimmedCode }
        });
        if (existingProduct) {
          rowErrors.push(`El Código de Producto "${trimmedCode}" ya existe en la base de datos`);
        }
      }
    }

    // Category validation - ensure category exists if provided
    if (product.category_id === null && product.category_name) {
      rowErrors.push(`Categoría "${product.category_name}" no encontrada. Verifique la hoja Categorías para valores válidos.`);
    }

    // Subcategory validation
    if (product.subcategory1_id === null && product.subcategory1_name) {
      rowErrors.push(`Subcategoría 1 "${product.subcategory1_name}" no encontrada. Verifique la hoja Subcategorías1 para valores válidos.`);
    }

    if (product.subcategory2_id === null && product.subcategory2_name) {
      rowErrors.push(`Subcategoría 2 "${product.subcategory2_name}" no encontrada. Verifique la hoja Subcategorías2 para valores válidos.`);
    }

    // Temperature range validation
    if (product.temperature_range_id === null && product.temperature_range_name) {
      rowErrors.push(`Rango de Temperatura "${product.temperature_range_name}" no encontrado. Verifique la hoja Rangos_Temperatura para valores válidos.`);
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
      { Paso: 1, Instrucción: 'Complete la hoja de Productos con la información del producto' },
      { Paso: 2, Instrucción: 'Use nombres EXACTOS de las hojas de referencia (Categorías, Subcategorías, etc.)' },
      { Paso: 3, Instrucción: 'Nombre del Producto y Fabricante son campos obligatorios' },
      { Paso: 4, Instrucción: 'Los códigos de producto deben ser únicos o déjelos en blanco para generación automática' },
      { Paso: 5, Instrucción: 'Los nombres de categorías deben coincidir exactamente con la hoja Categorías' },
      { Paso: 6, Instrucción: 'Los nombres de subcategorías deben coincidir exactamente con las hojas respectivas' },
      { Paso: 7, Instrucción: 'Los rangos de temperatura deben coincidir exactamente con la hoja Rangos_Temperatura' },
      { Paso: 8, Instrucción: 'Elimine las filas de ejemplo antes de cargar sus datos' },
      { Paso: 9, Instrucción: 'Cargue el archivo completado en la página de carga masiva' },
      { Paso: 10, Instrucción: 'Carga de documentos no compatible vía Excel - agregue manualmente después de importar' }
    ];

    // MAIN PRODUCTS SHEET - Using safe fallbacks with comprehensive examples
    const productsData = [
      {
        'Nombre del Producto': 'Paracetamol 500mg',
        'Código de Producto': 'PRD-001',
        'Fabricante': 'Pfizer',
        'Categoría': categories.length > 0 ? categories[0].name : 'Medicamentos',
        'Subcategoría 1': subcategories1.length > 0 ? subcategories1[0].name : 'Analgesicos',
        'Subcategoría 2': subcategories2.length > 0 ? subcategories2[0].name : 'Tabletas',
        'Rango de Temperatura': temperatureRanges.length > 0 ? temperatureRanges[0].range : '15-25°C',
        'Humedad': '60%',
        'Observaciones': 'Almacenar en lugar seco alejado de la luz solar directa'
      },
      {
        'Nombre del Producto': 'Vitamina C 1000mg',
        'Código de Producto': '',
        'Fabricante': 'Johnson & Johnson',
        'Categoría': categories.length > 1 ? categories[1].name : 'Suplementos',
        'Subcategoría 1': '',
        'Subcategoría 2': '',
        'Rango de Temperatura': temperatureRanges.length > 1 ? temperatureRanges[1].range : '2-8°C',
        'Humedad': '',
        'Observaciones': ''
      }
    ];

    // Add main sheets in the same order as working entry template
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructions), 'Instrucciones');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsData), 'Productos');

    // Reference data sheets with robust error handling - matching entry template pattern
    console.log('📋 Adding reference data sheets...');

    try {
      // Categories reference sheet
      const categoriesData = categories.length > 0 ?
        categories.map(cat => ({
          Nombre: cat.name || 'Desconocido',
          Descripción: cat.description || 'N/A'
        })) :
        [
          { Nombre: 'Medicamentos', Descripción: 'Productos farmacéuticos' },
          { Nombre: 'Suplementos', Descripción: 'Suplementos de salud' },
          { Nombre: 'Dispositivos', Descripción: 'Dispositivos médicos' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categoriesData), 'Categorías');

      // Subcategories1 reference sheet
      const subcategories1Data = subcategories1.length > 0 ?
        subcategories1.map(sub => ({
          Nombre: sub.name || 'Desconocido',
          Descripción: sub.description || 'N/A'
        })) :
        [
          { Nombre: 'Analgesicos', Descripción: 'Medicamentos para aliviar el dolor' },
          { Nombre: 'Antibioticos', Descripción: 'Medicamentos antibióticos' },
          { Nombre: 'Vitaminas', Descripción: 'Suplementos vitamínicos' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subcategories1Data), 'Subcategorías1');

      // Subcategories2 reference sheet
      const subcategories2Data = subcategories2.length > 0 ?
        subcategories2.map(sub => ({
          Nombre: sub.name || 'Desconocido',
          Descripción: sub.description || 'N/A'
        })) :
        [
          { Nombre: 'Tabletas', Descripción: 'Forma de tableta' },
          { Nombre: 'Capsulas', Descripción: 'Forma de cápsula' },
          { Nombre: 'Jarabe', Descripción: 'Forma de jarabe' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subcategories2Data), 'Subcategorías2');

      // Temperature ranges reference sheet
      const tempRangesData = temperatureRanges.length > 0 ?
        temperatureRanges.map(tr => ({
          Rango: tr.range || 'Desconocido',
          'Mín Celsius': tr.min_celsius || '',
          'Máx Celsius': tr.max_celsius || '',
          Descripción: `${tr.min_celsius || 'N/A'}°C a ${tr.max_celsius || 'N/A'}°C`
        })) :
        [
          { Rango: '15-25°C', 'Mín Celsius': '15', 'Máx Celsius': '25', Descripción: 'Almacenamiento a temperatura ambiente' },
          { Rango: '2-8°C', 'Mín Celsius': '2', 'Máx Celsius': '8', Descripción: 'Almacenamiento refrigerado' },
          { Rango: 'Ambiente', 'Mín Celsius': '15', 'Máx Celsius': '30', Descripción: 'Temperatura ambiente' }
        ];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tempRangesData), 'Rangos_Temperatura');

      console.log('✅ Reference data sheets added successfully');
    } catch (sheetError) {
      console.error('❌ Error adding reference sheets:', sheetError);
      // Add minimal fallback sheets to prevent corruption
      const fallbackData = [{ Error: 'Error al cargar datos de referencia', Contacto: 'Administrador' }];
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Categorías');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Subcategorías1');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Subcategorías2');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fallbackData), 'Rangos_Temperatura');
    }

    // Field reference sheet for detailed field information
    const fieldReference = [
      { Campo: 'Nombre del Producto', Requerido: 'SÍ', Ejemplo: 'Paracetamol 500mg', Descripción: 'Nombre completo del producto incluyendo dosis si aplica' },
      { Campo: 'Código de Producto', Requerido: 'NO', Ejemplo: 'PRD-001 o en blanco', Descripción: 'Código único del producto. Dejar vacío para generación automática (formato: PRD-XXXXXXXX)' },
      { Campo: 'Fabricante', Requerido: 'SÍ', Ejemplo: 'Pfizer', Descripción: 'Fabricante o marca del producto' },
      { Campo: 'Categoría', Requerido: 'NO', Ejemplo: 'Medicamentos', Descripción: 'Categoría del producto - debe coincidir EXACTAMENTE con los valores de la hoja Categorías' },
      { Campo: 'Subcategoría 1', Requerido: 'NO', Ejemplo: 'Analgesicos', Descripción: 'Subcategoría del producto nivel 1 - debe coincidir EXACTAMENTE con los valores de la hoja Subcategorías1' },
      { Campo: 'Subcategoría 2', Requerido: 'NO', Ejemplo: 'Tabletas', Descripción: 'Subcategoría del producto nivel 2 - debe coincidir EXACTAMENTE con los valores de la hoja Subcategorías2' },
      { Campo: 'Rango de Temperatura', Requerido: 'NO', Ejemplo: '15-25°C', Descripción: 'Rango de temperatura de almacenamiento - debe coincidir EXACTAMENTE con los valores de la hoja Rangos_Temperatura' },
      { Campo: 'Humedad', Requerido: 'NO', Ejemplo: '60% o 45-65%', Descripción: 'Requisitos de humedad de almacenamiento' },
      { Campo: 'Observaciones', Requerido: 'NO', Ejemplo: 'Almacenar en lugar seco', Descripción: 'Notas adicionales, instrucciones especiales de manejo o comentarios' }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fieldReference), 'Referencia_Campos');

    // Important notes sheet
    const importantNotes = [
      { Nota: 'REQUISITOS CRÍTICOS', Detalle: 'La hoja DEBE llamarse "Productos" (sensible a mayúsculas)' },
      { Nota: 'CONVENCIÓN DE NOMBRES', Detalle: 'Los nombres de categorías no distinguen mayúsculas pero deben coincidir exactamente con los datos de referencia' },
      { Nota: 'UNICIDAD', Detalle: 'Los códigos de producto deben ser únicos en el sistema - los duplicados serán rechazados' },
      { Nota: 'VALIDACIÓN', Detalle: 'Todos los datos serán validados contra los registros existentes del sistema' },
      { Nota: 'LIMITACIONES', Detalle: 'Carga de documentos no compatible vía Excel - agregar manualmente después de importar' },
      { Nota: 'PREPARACIÓN', Detalle: 'Elimine todas las filas de ejemplo antes de cargar sus datos reales' },
      { Nota: 'PRUEBAS', Detalle: 'Pruebe primero con un lote pequeño antes de cargar conjuntos de datos grandes' },
      { Nota: 'SOPORTE', Detalle: 'Contacte al administrador del sistema si encuentra errores de validación' }
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importantNotes), 'Notas_Importantes');

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