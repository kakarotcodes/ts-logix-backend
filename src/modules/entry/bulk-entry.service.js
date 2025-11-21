const XLSX = require('xlsx');
const { PrismaClient } = require("@prisma/client");
const { createEntryOrder, getCurrentEntryOrderNo } = require("./entry.service");

const prisma = new PrismaClient();

/**
 * Process bulk entry orders from Excel file
 * Following existing TSLogix patterns and validation
 */
async function processBulkEntryOrders(fileBuffer, userId, userRole, organisationId) {
  const startTime = Date.now();
  console.log(`📊 BULK ENTRY: Starting bulk processing at ${new Date().toISOString()}`);

  try {
    // 1. Parse Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const validationResult = await validateExcelStructure(workbook, userId, userRole);

    if (!validationResult.isValid) {
      return {
        success: false,
        message: 'Excel validation failed',
        errors: validationResult.errors,
        processing_time_ms: Date.now() - startTime
      };
    }

    // 2. Extract and validate data
    const { orderHeaders, orderProducts } = validationResult.data;

    // 3. Check for system duplicates
    const duplicateCheck = await checkForSystemDuplicates(orderHeaders, userId, userRole);
    if (!duplicateCheck.success) {
      return duplicateCheck;
    }

    // 4. Process orders in optimized batches
    const result = await processOrdersInBatches(
      orderHeaders,
      orderProducts,
      userId,
      userRole,
      organisationId
    );

    console.log(`✅ BULK ENTRY: Completed processing ${result.successful_orders.length} successful, ${result.failed_orders.length} failed`);

    return {
      success: true,
      message: `Successfully processed ${result.successful_orders.length} out of ${orderHeaders.length} orders`,
      data: result,
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('❌ Error in bulk entry processing:', error);
    return {
      success: false,
      message: 'Bulk processing failed',
      error: error.message,
      processing_time_ms: Date.now() - startTime
    };
  }
}

/**
 * Validate Excel file structure and data - updated for user-friendly template
 */
async function validateExcelStructure(workbook, userId, userRole) {
  const errors = [];

  try {
    // Check required sheets exist
    const requiredSheets = ['Entry_Orders', 'Products'];
    const availableSheets = workbook.SheetNames;

    for (const sheet of requiredSheets) {
      if (!availableSheets.includes(sheet)) {
        errors.push(`Missing required sheet: ${sheet}`);
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Parse Entry Orders
    const entryOrdersSheet = workbook.Sheets['Entry_Orders'];
    const entryOrders = XLSX.utils.sheet_to_json(entryOrdersSheet);

    // Parse Products
    const productsSheet = workbook.Sheets['Products'];
    const products = XLSX.utils.sheet_to_json(productsSheet);

    if (entryOrders.length === 0) {
      errors.push('Entry_Orders sheet is empty');
    }

    if (products.length === 0) {
      errors.push('Products sheet is empty');
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Validate data structure with name-to-ID mapping
    const headerValidation = await validateEntryOrdersWithMapping(entryOrders, userId, userRole);
    const productValidation = await validateProductsWithMapping(products, entryOrders, userId, userRole);

    errors.push(...headerValidation.errors);
    errors.push(...productValidation.errors);

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      data: {
        orderHeaders: headerValidation.validData,
        orderProducts: productValidation.validData
      }
    };

  } catch (error) {
    return {
      isValid: false,
      errors: [`Excel parsing error: ${error.message}`]
    };
  }
}

/**
 * Validate entry orders with name-to-ID mapping
 */
async function validateEntryOrdersWithMapping(entryOrders, userId, userRole) {
  const errors = [];
  const validData = [];

  // Get reference data for name-to-ID mapping
  const [origins, suppliers, users] = await Promise.all([
    prisma.origin.findMany({ select: { origin_id: true, name: true } }),
    userRole === 'CLIENT' ?
      // Get client-assigned suppliers
      (async () => {
        const clientUser = await prisma.clientUser.findFirst({
          where: { user_id: userId, is_active: true },
          include: { client: true }
        });
        if (clientUser?.client) {
          return prisma.supplier.findMany({
            where: {
              clientAssignments: {
                some: { client_id: clientUser.client.client_id, is_active: true }
              }
            },
            select: { supplier_id: true, company_name: true, name: true }
          });
        }
        return [];
      })() :
      // Get all suppliers for non-CLIENT users
      prisma.supplier.findMany({ select: { supplier_id: true, company_name: true, name: true } }),

    prisma.user.findMany({
      where: {
        role: {
          name: { in: ['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'] }
        }
      },
      select: { user_id: true, first_name: true, last_name: true, role: { select: { name: true } } }
    })
  ]);

  // Create name-to-ID mappings
  const originNameToId = new Map(origins.map(o => [o.name.toLowerCase().trim(), o.origin_id]));
  const supplierNameToId = new Map();
  suppliers.forEach(s => {
    if (s.company_name) supplierNameToId.set(s.company_name.toLowerCase().trim(), s.supplier_id);
    if (s.name) supplierNameToId.set(s.name.toLowerCase().trim(), s.supplier_id);
  });
  const userNameToId = new Map(users.map(u => {
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return [fullName.toLowerCase().trim(), u.user_id];
  }));

  for (let i = 0; i < entryOrders.length; i++) {
    const row = entryOrders[i];
    const rowNumber = i + 2; // Excel row number (accounting for header)
    const rowErrors = [];
    const mappedRow = { ...row };

    // Generate entry order number for this row (will be assigned unique numbers during processing)
    mappedRow.order_index = i; // Use row index to group products with orders later

    // Origin name mapping
    if (!row['Origin Name']) {
      rowErrors.push(`Row ${rowNumber}: Origin Name is required`);
    } else {
      const originName = row['Origin Name'].toLowerCase().trim();
      const originId = originNameToId.get(originName);
      if (!originId) {
        rowErrors.push(`Row ${rowNumber}: Invalid Origin Name '${row['Origin Name']}'. Check Origins reference sheet.`);
      } else {
        mappedRow.origin_id = originId;
      }
    }

    // Personnel mapping
    if (!row['Personnel In Charge']) {
      rowErrors.push(`Row ${rowNumber}: Personnel In Charge is required`);
    } else {
      const personnelName = row['Personnel In Charge'].toLowerCase().trim();
      const personnelId = userNameToId.get(personnelName);
      if (!personnelId) {
        rowErrors.push(`Row ${rowNumber}: Invalid Personnel In Charge '${row['Personnel In Charge']}'. Check Personnel reference sheet.`);
      } else {
        mappedRow.personnel_incharge_id = personnelId;
      }
    }

    // Supplier mapping (optional for reconditioned orders)
    if (row['Supplier Name']) {
      const supplierName = row['Supplier Name'].toLowerCase().trim();
      const supplierId = supplierNameToId.get(supplierName);
      if (!supplierId) {
        rowErrors.push(`Row ${rowNumber}: Invalid Supplier Name '${row['Supplier Name']}'. Check Suppliers reference sheet.`);
      } else {
        mappedRow.supplier_id = supplierId;
      }
    }

    // Date validation
    if (!row['Registration Date']) {
      rowErrors.push(`Row ${rowNumber}: Registration Date is required`);
    } else {
      mappedRow.registration_date = row['Registration Date'];
      if (!isValidDate(row['Registration Date'])) {
        rowErrors.push(`Row ${rowNumber}: Invalid Registration Date format. Use YYYY-MM-DD`);
      }
    }

    if (!row['Document Date']) {
      rowErrors.push(`Row ${rowNumber}: Document Date is required`);
    } else {
      mappedRow.document_date = row['Document Date'];
      if (!isValidDate(row['Document Date'])) {
        rowErrors.push(`Row ${rowNumber}: Invalid Document Date format. Use YYYY-MM-DD`);
      }
    }

    if (!row['Admission Date Time']) {
      rowErrors.push(`Row ${rowNumber}: Admission Date Time is required`);
    } else {
      mappedRow.entry_date_time = row['Admission Date Time'];
      if (!isValidDateTime(row['Admission Date Time'])) {
        rowErrors.push(`Row ${rowNumber}: Invalid Admission Date Time format. Use YYYY-MM-DD HH:MM:SS`);
      }
    }

    // Numeric validation
    if (row['CIF Value']) {
      const cifValue = parseFloat(row['CIF Value']);
      if (isNaN(cifValue) || cifValue < 0) {
        rowErrors.push(`Row ${rowNumber}: CIF Value must be a positive number`);
      } else {
        mappedRow.cif_value = cifValue;
      }
    }

    // Optional fields
    mappedRow.guide_number = row['Guide Number'] || '';
    mappedRow.observation = row['Observation'] || '';
    mappedRow.order_status = 'REVISION'; // Auto-set as per frontend

    if (rowErrors.length === 0) {
      validData.push({
        ...mappedRow,
        row_number: rowNumber
      });
    } else {
      errors.push(...rowErrors);
    }
  }

  return { errors, validData };
}

/**
 * Validate products with name-to-ID mapping
 */
async function validateProductsWithMapping(products, entryOrders, userId, userRole) {
  const errors = [];
  const validData = [];

  // Get valid order indices from headers (0, 1, 2, etc.)
  const validOrderIndices = new Set(entryOrders.map((h, index) => index));

  // Get reference data based on user role
  let availableProducts, availableSuppliers;

  if (userRole === 'CLIENT') {
    const clientUser = await prisma.clientUser.findFirst({
      where: { user_id: userId, is_active: true },
      include: { client: true }
    });

    if (clientUser?.client) {
      const clientId = clientUser.client.client_id;

      [availableProducts, availableSuppliers] = await Promise.all([
        prisma.product.findMany({
          where: {
            clientAssignments: {
              some: { client_id: clientId, is_active: true }
            }
          },
          select: { product_id: true, product_code: true, name: true }
        }),
        prisma.supplier.findMany({
          where: {
            clientAssignments: {
              some: { client_id: clientId, is_active: true }
            }
          },
          select: { supplier_id: true, company_name: true, name: true }
        })
      ]);
    } else {
      return { errors: ['Client assignment not found'], validData: [] };
    }
  } else {
    [availableProducts, availableSuppliers] = await Promise.all([
      prisma.product.findMany({
        select: { product_id: true, product_code: true, name: true }
      }),
      prisma.supplier.findMany({
        select: { supplier_id: true, company_name: true, name: true }
      })
    ]);
  }

  // Create mappings
  const productCodeToId = new Map(availableProducts.map(p => [p.product_code.toLowerCase().trim(), p.product_id]));
  const supplierNameToId = new Map();
  availableSuppliers.forEach(s => {
    if (s.company_name) supplierNameToId.set(s.company_name.toLowerCase().trim(), s.supplier_id);
    if (s.name) supplierNameToId.set(s.name.toLowerCase().trim(), s.supplier_id);
  });


  // Valid presentation and temperature options (updated to match database dropdown options)
  const validPresentations = new Set(['CAJA', 'PALETA', 'SACO', 'UNIDAD', 'PAQUETE', 'TAMBOS', 'BULTO', 'OTRO']);
  const validTemperatureRanges = new Set(['RANGE_15_30', 'RANGE_15_25', 'RANGE_2_8', 'AMBIENTE']);

  // Track products per order for duplicate detection
  const productsPerOrder = new Map();

  for (let i = 0; i < products.length; i++) {
    const row = products[i];
    const rowNumber = i + 2;
    const rowErrors = [];
    const mappedRow = { ...row };

    // Order Index validation (products must specify which order they belong to)
    const orderIndex = parseInt(row['Order Index']);
    if (isNaN(orderIndex) || orderIndex < 0) {
      rowErrors.push(`Row ${rowNumber}: Order Index must be a valid number (0, 1, 2, etc.)`);
    } else {
      mappedRow.order_index = orderIndex;
    }

    // Product code validation and mapping
    if (!row['Product Code']) {
      rowErrors.push(`Row ${rowNumber}: Product Code is required`);
    } else {
      const productCode = row['Product Code'].toLowerCase().trim();
      const productId = productCodeToId.get(productCode);
      if (!productId) {
        rowErrors.push(`Row ${rowNumber}: Product Code '${row['Product Code']}' not found or not assigned to client. Check Products_Reference sheet.`);
      } else {
        mappedRow.product_id = productId;
        mappedRow.product_code = row['Product Code']; // Keep original case
      }
    }

    // Supplier validation and mapping
    if (!row['Supplier Name']) {
      rowErrors.push(`Row ${rowNumber}: Supplier Name is required`);
    } else {
      const supplierName = row['Supplier Name'].toLowerCase().trim();
      const supplierId = supplierNameToId.get(supplierName);
      if (!supplierId) {
        rowErrors.push(`Row ${rowNumber}: Supplier Name '${row['Supplier Name']}' not found or not assigned to client. Check Suppliers reference sheet.`);
      } else {
        mappedRow.supplier_id = supplierId;
      }
    }

    // Required field validation
    const requiredFields = [
      ['Serial Number', 'serial_number'],
      ['Lot Series', 'lot_series'],
      ['Manufacturing Date', 'manufacturing_date'],
      ['Expiration Date', 'expiration_date'],
      ['Inventory Quantity', 'inventory_quantity'],
      ['Package Quantity', 'package_quantity'],
      ['Weight (kg)', 'weight_kg']
    ];

    requiredFields.forEach(([excelField, dbField]) => {
      if (!row[excelField]) {
        rowErrors.push(`Row ${rowNumber}: ${excelField} is required`);
      } else {
        mappedRow[dbField] = row[excelField];
      }
    });

    // Numeric validation
    const numericFields = [
      ['Inventory Quantity', 'inventory_quantity'],
      ['Package Quantity', 'package_quantity'],
      ['Weight (kg)', 'weight_kg'],
      ['Volume (m³)', 'volume_m3'],
      ['Quantity Pallets', 'quantity_pallets'],
      ['Insured Value', 'insured_value']
    ];

    numericFields.forEach(([excelField, dbField]) => {
      if (row[excelField]) {
        const value = parseFloat(row[excelField]);
        if (isNaN(value) || value < 0) {
          rowErrors.push(`Row ${rowNumber}: ${excelField} must be a positive number`);
        } else {
          mappedRow[dbField] = value;
        }
      }
    });

    // Date validation
    if (row['Manufacturing Date'] && row['Expiration Date']) {
      const mfgDate = new Date(row['Manufacturing Date']);
      const expDate = new Date(row['Expiration Date']);
      if (isNaN(mfgDate) || isNaN(expDate)) {
        rowErrors.push(`Row ${rowNumber}: Invalid date format. Use YYYY-MM-DD`);
      } else if (expDate <= mfgDate) {
        rowErrors.push(`Row ${rowNumber}: Expiration Date must be after Manufacturing Date`);
      }
    }

    // Presentation validation
    if (row['Presentation']) {
      if (!validPresentations.has(row['Presentation'])) {
        rowErrors.push(`Row ${rowNumber}: Invalid Presentation '${row['Presentation']}'. Valid options: ${Array.from(validPresentations).join(', ')}`);
      } else {
        mappedRow.presentation = row['Presentation'];
      }
    } else {
      mappedRow.presentation = 'CAJA'; // Default
    }

    // Temperature range validation
    if (row['Temperature Range']) {
      if (!validTemperatureRanges.has(row['Temperature Range'])) {
        rowErrors.push(`Row ${rowNumber}: Invalid Temperature Range '${row['Temperature Range']}'. Valid options: ${Array.from(validTemperatureRanges).join(', ')}`);
      } else {
        mappedRow.temperature_range = row['Temperature Range'];
      }
    } else {
      mappedRow.temperature_range = 'AMBIENTE'; // Default
    }

    // Optional fields mapping
    const optionalFields = [
      ['Humidity', 'humidity'],
      ['Health Registration', 'health_registration'],
      ['Product Description', 'product_description'],
      ['Technical Specification', 'technical_specification']
    ];

    optionalFields.forEach(([excelField, dbField]) => {
      if (row[excelField]) {
        mappedRow[dbField] = row[excelField];
      }
    });

    // Duplicate product detection within order
    if (mappedRow.order_index !== undefined && row['Product Code']) {
      if (!productsPerOrder.has(mappedRow.order_index)) {
        productsPerOrder.set(mappedRow.order_index, new Set());
      }

      const orderProducts = productsPerOrder.get(mappedRow.order_index);
      if (orderProducts.has(row['Product Code'])) {
        rowErrors.push(`Row ${rowNumber}: Duplicate Product Code '${row['Product Code']}' in order index ${mappedRow.order_index}`);
      } else {
        orderProducts.add(row['Product Code']);
      }
    }

    if (rowErrors.length === 0) {
      validData.push({
        ...mappedRow,
        row_number: rowNumber
      });
    } else {
      errors.push(...rowErrors);
    }
  }

  return { errors, validData };
}

/**
 * Check for system-wide duplicates following existing pattern
 */
async function checkForSystemDuplicates(orderHeaders, userId, userRole) {
  // Since order numbers are auto-generated, no need to check for duplicates
  // This function is kept for consistency but simplified
  return { success: true };
}

/**
 * Process orders in optimized batches to prevent database overload
 */
async function processOrdersInBatches(orderHeaders, orderProducts, userId, userRole, organisationId) {
  const BATCH_SIZE = 5; // Process 5 orders at a time for pharmaceutical complexity
  const successful_orders = [];
  const failed_orders = [];

  // Group products by order index
  const productsByOrder = new Map();
  orderProducts.forEach(product => {
    const productOrderIndex = product.order_index;
    if (!productsByOrder.has(productOrderIndex)) {
      productsByOrder.set(productOrderIndex, []);
    }
    productsByOrder.get(productOrderIndex).push(product);
  });

  // Get the starting order number for the batch
  const baseOrderNo = await getCurrentEntryOrderNo();

  // Extract year prefix (e.g., "OI2025") and starting count
  const yearPrefix = baseOrderNo.substring(0, 6); // "OI2025"
  const startingCount = parseInt(baseOrderNo.substring(6)); // Extract the number part (e.g., "003" -> 3)

  console.log(`📦 Starting bulk processing with base order: ${baseOrderNo}`);

  // Process orders sequentially to ensure proper order number incrementation
  for (let i = 0; i < orderHeaders.length; i++) {
    const orderHeader = orderHeaders[i];

    console.log(`📦 Processing order ${i + 1}/${orderHeaders.length} (Order Index: ${orderHeader.order_index})`);

    try {
      const orderProducts = productsByOrder.get(orderHeader.order_index) || [];

      // Generate sequential order number for this batch (3-digit format)
      const currentOrderNo = `${yearPrefix}${String(startingCount + i).padStart(3, "0")}`;
      console.log(`📦 Assigned order number: ${currentOrderNo}`);

      // Calculate total pallets from products
      const totalPallets = orderProducts.reduce((sum, product) => {
        return sum + (parseInt(product.quantity_pallets) || 0);
      }, 0);

      // Transform data to match existing createEntryOrder service
      const entryData = {
        entry_order_no: currentOrderNo,
        origin_id: orderHeader.origin_id,
        document_type_id: orderHeader.document_type_id,
        registration_date: orderHeader.registration_date,
        document_date: orderHeader.document_date,
        entry_date_time: orderHeader.entry_date_time,
        order_status: orderHeader.order_status || 'REVISION',
        total_volume: orderHeader.total_volume,
        total_weight: orderHeader.total_weight,
        cif_value: orderHeader.cif_value,
        total_pallets: totalPallets,
        observation: orderHeader.observation,
        warehouse_id: orderHeader.warehouse_id,
        organisation_id: organisationId,
        created_by: userId,
        products: orderProducts.map(product => ({
          serial_number: product.serial_number,
          supplier_id: product.supplier_id,
          product_code: product.product_code,
          product_id: product.product_id,
          lot_series: product.lot_series,
          manufacturing_date: product.manufacturing_date,
          expiration_date: product.expiration_date,
          inventory_quantity: parseInt(product.inventory_quantity),
          package_quantity: parseInt(product.package_quantity),
          quantity_pallets: product.quantity_pallets ? parseInt(product.quantity_pallets) : null,
          presentation: product.presentation || 'CAJA',
          guide_number: product.guide_number,
          weight_kg: parseFloat(product.weight_kg),
          volume_m3: product.volume_m3 ? parseFloat(product.volume_m3) : null,
          insured_value: product.insured_value ? parseFloat(product.insured_value) : null,
          temperature_range: product.temperature_range || 'AMBIENTE',
          humidity: product.humidity,
          health_registration: product.health_registration
        }))
      };

      // Use existing createEntryOrder function for consistency
      const result = await createEntryOrder(entryData);

      successful_orders.push({
        entry_order_no: currentOrderNo,
        entry_order_id: result.entryOrder.entry_order_id,
        products_count: orderProducts.length
      });

    } catch (error) {
      failed_orders.push({
        entry_order_no: `Order ${orderHeader.order_index}`,
        error: error.message,
        row_number: orderHeader.row_number || (orderHeader.order_index + 2)
      });
    }
  }

  return { successful_orders, failed_orders };
}

/**
 * Generate Excel template for bulk entry orders - matches frontend exactly
 */
async function generateBulkEntryTemplate(userId, userRole) {
  try {
    // Get reference data based on user role (following existing pattern)
    let origins, documentTypes, products, suppliers, users, temperatureRanges, presentationOptions;

    if (userRole === 'CLIENT') {
      const clientUser = await prisma.clientUser.findFirst({
        where: { user_id: userId, is_active: true },
        include: { client: true }
      });

      if (clientUser?.client) {
        const clientId = clientUser.client.client_id;

        [origins, documentTypes, products, suppliers, users, temperatureRanges, presentationOptions] = await Promise.all([
          prisma.origin.findMany({ select: { origin_id: true, name: true, type: true } }),
          prisma.documentType.findMany({ select: { document_type_id: true, name: true, type: true } }),
          prisma.product.findMany({
            where: {
              clientAssignments: {
                some: { client_id: clientId, is_active: true }
              }
            },
            select: { product_id: true, product_code: true, name: true, manufacturer: true }
          }),
          prisma.supplier.findMany({
            where: {
              clientAssignments: {
                some: { client_id: clientId, is_active: true }
              }
            },
            select: { supplier_id: true, company_name: true, name: true }
          }),
          prisma.user.findMany({
            where: {
              role: {
                name: { in: ['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'] }
              }
            },
            select: { user_id: true, first_name: true, last_name: true, role: { select: { name: true } } }
          }),
          // Static temperature range options matching frontend
          Promise.resolve([
            { value: 'AMBIENTE', label: 'Ambiente (15-25°C)' },
            { value: 'FRIO', label: 'Frío (2-8°C)' },
            { value: 'CONGELADO', label: 'Congelado (-15°C a -25°C)' }
          ]),
          // Static presentation options matching frontend
          Promise.resolve([
            { value: 'CAJA', label: 'Caja' },
            { value: 'BLISTER', label: 'Blister' },
            { value: 'FRASCO', label: 'Frasco' },
            { value: 'AMPOLLA', label: 'Ampolla' },
            { value: 'VIAL', label: 'Vial' },
            { value: 'SOBRE', label: 'Sobre' }
          ])
        ]);
      } else {
        throw new Error('Client assignment not found');
      }
    } else {
      [origins, documentTypes, products, suppliers, users, temperatureRanges, presentationOptions] = await Promise.all([
        prisma.origin.findMany({ select: { origin_id: true, name: true, type: true } }),
        prisma.documentType.findMany({ select: { document_type_id: true, name: true, type: true } }),
        prisma.product.findMany({ select: { product_id: true, product_code: true, name: true, manufacturer: true } }),
        prisma.supplier.findMany({ select: { supplier_id: true, company_name: true, name: true } }),
        prisma.user.findMany({
          where: {
            role: {
              name: { in: ['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'] }
            }
          },
          select: { user_id: true, first_name: true, last_name: true, role: { select: { name: true } } }
        }),
        // Static temperature range options matching frontend
        Promise.resolve([
          { value: 'AMBIENTE', label: 'Ambiente (15-25°C)' },
          { value: 'FRIO', label: 'Frío (2-8°C)' },
          { value: 'CONGELADO', label: 'Congelado (-15°C a -25°C)' }
        ]),
        // Static presentation options matching frontend
        Promise.resolve([
          { value: 'CAJA', label: 'Caja' },
          { value: 'BLISTER', label: 'Blister' },
          { value: 'FRASCO', label: 'Frasco' },
          { value: 'AMPOLLA', label: 'Ampolla' },
          { value: 'VIAL', label: 'Vial' },
          { value: 'SOBRE', label: 'Sobre' }
        ])
      ]);
    }

    // Create workbook with multiple sheets
    const workbook = XLSX.utils.book_new();

    // INSTRUCTIONS SHEET - User guide
    const instructions = [
      { Step: 1, Instruction: 'Fill out the Entry Orders sheet with one row per order' },
      { Step: 2, Instruction: 'Fill out the Products sheet with all products for each order' },
      { Step: 3, Instruction: 'Use EXACT names from the reference sheets (Origins, Suppliers, etc.)' },
      { Step: 4, Instruction: 'For Document Types, select from available options in DocumentTypes sheet' },
      { Step: 5, Instruction: 'Product codes must match exactly from Products reference sheet' },
      { Step: 6, Instruction: 'Dates should be in YYYY-MM-DD format' },
      { Step: 7, Instruction: 'Date-time should be in YYYY-MM-DD HH:MM:SS format' },
      { Step: 8, Instruction: 'Temperature Range options: AMBIENTE, RANGE_15_25, RANGE_15_30, RANGE_2_8' },
      { Step: 9, Instruction: 'Presentation options: CAJA, PALETA, SACO, UNIDAD, PAQUETE, TAMBOS, BULTO, OTRO' },
      { Step: 10, Instruction: 'Upload the completed file to the bulk upload page' }
    ];

    // ENTRY ORDERS TEMPLATE - Using user-friendly names
    const entryOrdersTemplate = [
      {
        'Origin Name': origins[0]?.name || 'Import',
        'Personnel In Charge': users[0] ? `${users[0].first_name || ''} ${users[0].last_name || ''}`.trim() : 'Select from Personnel sheet',
        'Supplier Name': suppliers[0]?.company_name || suppliers[0]?.name || 'Select from Suppliers sheet',
        'Registration Date': '2025-01-15',
        'Document Date': '2025-01-15',
        'Admission Date Time': '2025-01-15 14:30:00',
        'CIF Value': '15000.00',
        'Guide Number': 'GN001',
        'Observation': 'Sample entry order - replace with your data'
      }
    ];

    // PRODUCTS TEMPLATE - Matching frontend form exactly
    const productsTemplate = [
      {
        'Order Index': '0',
        'Product Code': products[0]?.product_code || 'Select from Products sheet',
        'Supplier Name': suppliers[0]?.company_name || suppliers[0]?.name || 'Select from Suppliers sheet',
        'Serial Number': 'SN001',
        'Lot Series': 'LOT001',
        'Manufacturing Date': '2024-01-01',
        'Expiration Date': '2026-01-01',
        'Inventory Quantity': '100',
        'Package Quantity': '10',
        'Weight (kg)': '50.0',
        'Volume (m³)': '2.0',
        'Quantity Pallets': '1',
        'Presentation': 'CAJA',
        'Insured Value': '1000.00',
        'Temperature Range': 'AMBIENTE',
        'Humidity': '60%',
        'Health Registration': 'HR001',
        'Product Description': 'Product description here',
        'Technical Specification': 'Technical specs here'
      }
    ];

    // DOCUMENT UPLOADS TEMPLATE
    const documentsTemplate = [
      {
        'Order Index': '0',
        'Document Type': documentTypes[0]?.name || 'Select from DocumentTypes sheet',
        'File Name': 'document1.pdf',
        'Notes': 'Document upload will be handled separately after Excel processing'
      }
    ];

    // Add main sheets
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructions), 'Instructions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(entryOrdersTemplate), 'Entry_Orders');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsTemplate), 'Products');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentsTemplate), 'Documents');

    // Reference sheets for dropdown options
    const originsRef = origins.map(o => ({ Name: o.name, Type: o.type || 'N/A' }));
    const documentTypesRef = documentTypes.map(d => ({ Name: d.name, Type: d.type || 'N/A' }));
    const productsRef = products.map(p => ({
      'Product Code': p.product_code,
      'Product Name': p.name,
      'Manufacturer': p.manufacturer || 'N/A'
    }));
    const suppliersRef = suppliers.map(s => ({
      'Supplier Name': s.company_name || s.name,
      'Company': s.company_name || 'N/A',
      'Contact': s.name || 'N/A'
    }));
    const personnelRef = users.map(u => ({
      'Personnel Name': `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      'Role': u.role?.name || 'Unknown'
    }));
    const temperatureRef = temperatureRanges.map(t => ({
      'Value': t.value,
      'Description': t.label
    }));
    const presentationRef = presentationOptions.map(p => ({
      'Value': p.value,
      'Description': p.label
    }));

    // Add reference sheets
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(originsRef), 'Origins');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentTypesRef), 'DocumentTypes');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsRef), 'Products_Reference');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(suppliersRef), 'Suppliers');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(personnelRef), 'Personnel');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(temperatureRef), 'Temperature_Options');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(presentationRef), 'Presentation_Options');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      success: true,
      buffer,
      filename: `bulk_entry_template_${new Date().toISOString().split('T')[0]}.xlsx`
    };

  } catch (error) {
    console.error('Error generating template:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper functions
function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

function isValidDateTime(dateTimeString) {
  // Accept both 'YYYY-MM-DD HH:MM:SS' and 'YYYY-MM-DD HH:MM' formats
  const dateTime = new Date(dateTimeString);
  return dateTime instanceof Date && !isNaN(dateTime);
}

module.exports = {
  processBulkEntryOrders,
  generateBulkEntryTemplate,
  validateExcelStructure
};