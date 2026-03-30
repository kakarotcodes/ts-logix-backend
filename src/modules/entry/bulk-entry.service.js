const XLSX = require('xlsx');
const { PrismaClient } = require("@prisma/client");
const { createEntryOrder, getCurrentEntryOrderNo } = require("./entry.service");

const prisma = new PrismaClient();

/**
 * Convert Excel date to UTC ISO string
 * Handles: Excel serial numbers, Date objects, and string dates
 *
 * IMPORTANT: This function preserves the DATE as shown in Excel regardless of timezone.
 * If Excel shows "2025-01-15", the result will be "2025-01-15T00:00:00.000Z" (UTC midnight)
 * This prevents timezone shifts when uploading from different countries (e.g., Peru UTC-5)
 *
 * @param {number|string|Date} excelDate - Excel date value
 * @returns {string|null} - ISO date string in UTC or null
 */
function convertExcelDate(excelDate) {
  if (!excelDate) return null;

  // If it's already a string (ISO format or date string)
  if (typeof excelDate === 'string') {
    const trimmed = excelDate.trim();

    // If it's already an ISO string with timezone, return as-is
    if (trimmed.includes('T') && (trimmed.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(trimmed))) {
      return trimmed;
    }

    // If it's a date-only string (YYYY-MM-DD), treat as UTC midnight
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed + 'T00:00:00.000Z';
    }

    // If it's a datetime string (YYYY-MM-DD HH:MM:SS), treat as UTC
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      const normalized = trimmed.replace(/\s+/, 'T');
      return normalized.includes(':') && normalized.split(':').length === 2
        ? normalized + ':00.000Z'
        : normalized + '.000Z';
    }

    // Try to parse other string formats
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      // Extract date components and create UTC date to avoid timezone issues
      const year = parsed.getFullYear();
      const month = parsed.getMonth();
      const day = parsed.getDate();
      const hours = parsed.getHours();
      const minutes = parsed.getMinutes();
      const seconds = parsed.getSeconds();

      return new Date(Date.UTC(year, month, day, hours, minutes, seconds)).toISOString();
    }

    return null;
  }

  // If it's a Date object (from XLSX with cellDates: true)
  // IMPORTANT: Extract LOCAL date components and create UTC date
  // This preserves the date as shown in Excel regardless of server timezone
  if (excelDate instanceof Date) {
    if (isNaN(excelDate.getTime())) return null;

    // Get the LOCAL date/time components (what the user sees in Excel)
    const year = excelDate.getFullYear();
    const month = excelDate.getMonth();
    const day = excelDate.getDate();
    const hours = excelDate.getHours();
    const minutes = excelDate.getMinutes();
    const seconds = excelDate.getSeconds();

    // Create a UTC date with those same values
    // This ensures "2025-01-15" in Excel becomes "2025-01-15T00:00:00.000Z" in UTC
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds)).toISOString();
  }

  // If it's a number, treat as Excel serial date
  if (typeof excelDate === 'number') {
    // Excel serial date: days since 1900-01-01 (with 1900 leap year bug)
    // For date-only values (integer), we want midnight UTC
    // For datetime values (decimal), we include the time portion

    const isDateOnly = Number.isInteger(excelDate);

    // Excel epoch: Dec 30, 1899 (accounting for Excel's 1900 leap year bug)
    const excelEpochUTC = Date.UTC(1899, 11, 30, 0, 0, 0, 0);
    const milliseconds = excelDate * 24 * 60 * 60 * 1000;
    const actualDate = new Date(excelEpochUTC + milliseconds);

    if (isDateOnly) {
      // For date-only values, return just the date at UTC midnight
      const year = actualDate.getUTCFullYear();
      const month = actualDate.getUTCMonth();
      const day = actualDate.getUTCDate();
      return new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString();
    }

    return actualDate.toISOString();
  }

  return null;
}

/**
 * Process bulk entry orders from Excel file
 * Following existing TSLogix patterns and validation
 */
async function processBulkEntryOrders(fileBuffer, userId, userRole, organisationId, clientId = null) {
  const startTime = Date.now();
  console.log(`📊 BULK ENTRY: Starting bulk processing at ${new Date().toISOString()} for user ${userId}, client: ${clientId || 'N/A'}`);

  try {
    // 1. Parse Excel file with cellDates to get proper Date objects
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
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
      organisationId,
      clientId
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
    const requiredSheets = ['Órdenes_Entrada', 'Productos'];
    const availableSheets = workbook.SheetNames;

    for (const sheet of requiredSheets) {
      if (!availableSheets.includes(sheet)) {
        errors.push(`Falta la hoja requerida: ${sheet}`);
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Parse Entry Orders
    const entryOrdersSheet = workbook.Sheets['Órdenes_Entrada'];
    const entryOrders = XLSX.utils.sheet_to_json(entryOrdersSheet);

    // Parse Products
    const productsSheet = workbook.Sheets['Productos'];
    const products = XLSX.utils.sheet_to_json(productsSheet);

    if (entryOrders.length === 0) {
      errors.push('La hoja Órdenes_Entrada está vacía');
    }

    if (products.length === 0) {
      errors.push('La hoja Productos está vacía');
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
    if (!row['Nombre del Origen']) {
      rowErrors.push(`Fila ${rowNumber}: Nombre del Origen es requerido`);
    } else {
      const originName = row['Nombre del Origen'].toLowerCase().trim();
      const originId = originNameToId.get(originName);
      if (!originId) {
        rowErrors.push(`Fila ${rowNumber}: Nombre del Origen inválido '${row['Nombre del Origen']}'. Verifique la hoja de referencia Orígenes.`);
      } else {
        mappedRow.origin_id = originId;
      }
    }

    // Personnel mapping
    if (!row['Personal a Cargo']) {
      rowErrors.push(`Fila ${rowNumber}: Personal a Cargo es requerido`);
    } else {
      const personnelName = row['Personal a Cargo'].toLowerCase().trim();
      const personnelId = userNameToId.get(personnelName);
      if (!personnelId) {
        rowErrors.push(`Fila ${rowNumber}: Personal a Cargo inválido '${row['Personal a Cargo']}'. Verifique la hoja de referencia Personal.`);
      } else {
        mappedRow.personnel_incharge_id = personnelId;
      }
    }

    // Supplier mapping (optional for reconditioned orders)
    if (row['Nombre del Proveedor']) {
      const supplierName = row['Nombre del Proveedor'].toLowerCase().trim();
      const supplierId = supplierNameToId.get(supplierName);
      if (!supplierId) {
        rowErrors.push(`Fila ${rowNumber}: Nombre del Proveedor inválido '${row['Nombre del Proveedor']}'. Verifique la hoja de referencia Proveedores.`);
      } else {
        mappedRow.supplier_id = supplierId;
      }
    }

    // Date validation and conversion
    if (!row['Fecha de Registro']) {
      rowErrors.push(`Fila ${rowNumber}: Fecha de Registro es requerida`);
    } else {
      // Convert Excel serial date to ISO string
      const convertedDate = convertExcelDate(row['Fecha de Registro']);
      mappedRow.registration_date = convertedDate;
      if (!convertedDate || !isValidDate(convertedDate)) {
        rowErrors.push(`Fila ${rowNumber}: Formato de Fecha de Registro inválido. Use AAAA-MM-DD`);
      }
    }

    if (!row['Fecha del Documento']) {
      rowErrors.push(`Fila ${rowNumber}: Fecha del Documento es requerida`);
    } else {
      // Convert Excel serial date to ISO string
      const convertedDate = convertExcelDate(row['Fecha del Documento']);
      mappedRow.document_date = convertedDate;
      if (!convertedDate || !isValidDate(convertedDate)) {
        rowErrors.push(`Fila ${rowNumber}: Formato de Fecha del Documento inválido. Use AAAA-MM-DD`);
      }
    }

    if (!row['Fecha Hora de Admisión']) {
      rowErrors.push(`Fila ${rowNumber}: Fecha Hora de Admisión es requerida`);
    } else {
      // Convert Excel serial date to ISO string
      const convertedDateTime = convertExcelDate(row['Fecha Hora de Admisión']);
      mappedRow.entry_date_time = convertedDateTime;
      if (!convertedDateTime || !isValidDateTime(convertedDateTime)) {
        rowErrors.push(`Fila ${rowNumber}: Formato de Fecha Hora de Admisión inválido. Use AAAA-MM-DD HH:MM:SS`);
      }
    }

    // Numeric validation
    if (row['Valor CIF']) {
      const cifValue = parseFloat(row['Valor CIF']);
      if (isNaN(cifValue) || cifValue < 0) {
        rowErrors.push(`Fila ${rowNumber}: Valor CIF debe ser un número positivo`);
      } else {
        mappedRow.cif_value = cifValue;
      }
    }

    // Optional fields
    mappedRow.guide_number = row['Número de Guía'] || '';
    mappedRow.observation = row['Observación'] || '';
    mappedRow.order_status = 'PENDIENTE'; // Auto-set to pending when customer creates order

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
    const orderIndex = parseInt(row['Índice de Orden']);
    if (isNaN(orderIndex) || orderIndex < 0) {
      rowErrors.push(`Fila ${rowNumber}: Índice de Orden debe ser un número válido (0, 1, 2, etc.)`);
    } else {
      mappedRow.order_index = orderIndex;
    }

    // Product code validation and mapping
    if (!row['Código de Producto']) {
      rowErrors.push(`Fila ${rowNumber}: Código de Producto es requerido`);
    } else {
      const productCode = row['Código de Producto'].toLowerCase().trim();
      const productId = productCodeToId.get(productCode);
      if (!productId) {
        rowErrors.push(`Fila ${rowNumber}: Código de Producto '${row['Código de Producto']}' no encontrado o no asignado al cliente. Verifique la hoja Productos_Referencia.`);
      } else {
        mappedRow.product_id = productId;
        mappedRow.product_code = row['Código de Producto']; // Keep original case
      }
    }

    // Supplier validation and mapping
    if (!row['Nombre del Proveedor']) {
      rowErrors.push(`Fila ${rowNumber}: Nombre del Proveedor es requerido`);
    } else {
      const supplierName = row['Nombre del Proveedor'].toLowerCase().trim();
      const supplierId = supplierNameToId.get(supplierName);
      if (!supplierId) {
        rowErrors.push(`Fila ${rowNumber}: Nombre del Proveedor '${row['Nombre del Proveedor']}' no encontrado o no asignado al cliente. Verifique la hoja de referencia Proveedores.`);
      } else {
        mappedRow.supplier_id = supplierId;
      }
    }

    // Required field validation
    const requiredFields = [
      ['Número de Serie', 'serial_number'],
      ['Serie de Lote', 'lot_series'],
      ['Fecha de Fabricación', 'manufacturing_date'],
      ['Fecha de Vencimiento', 'expiration_date'],
      ['Cantidad de Inventario', 'inventory_quantity'],
      ['Cantidad de Paquetes', 'package_quantity'],
      ['Peso (kg)', 'weight_kg']
    ];

    requiredFields.forEach(([excelField, dbField]) => {
      if (!row[excelField]) {
        rowErrors.push(`Fila ${rowNumber}: ${excelField} es requerido`);
      } else {
        mappedRow[dbField] = row[excelField];
      }
    });

    // Numeric validation
    const numericFields = [
      ['Cantidad de Inventario', 'inventory_quantity'],
      ['Cantidad de Paquetes', 'package_quantity'],
      ['Peso (kg)', 'weight_kg'],
      ['Volumen (m³)', 'volume_m3'],
      ['Cantidad de Pallets', 'quantity_pallets'],
      ['Valor Asegurado', 'insured_value']
    ];

    numericFields.forEach(([excelField, dbField]) => {
      if (row[excelField]) {
        const value = parseFloat(row[excelField]);
        if (isNaN(value) || value < 0) {
          rowErrors.push(`Fila ${rowNumber}: ${excelField} debe ser un número positivo`);
        } else {
          mappedRow[dbField] = value;
        }
      }
    });

    // Date validation and conversion
    if (row['Fecha de Fabricación']) {
      const convertedMfgDate = convertExcelDate(row['Fecha de Fabricación']);
      mappedRow.manufacturing_date = convertedMfgDate;

      if (!convertedMfgDate) {
        rowErrors.push(`Fila ${rowNumber}: Formato de Fecha de Fabricación inválido. Use AAAA-MM-DD`);
      }
    }

    // Handle Expiration Date - accept "S / F" (Sin Fecha / Without Date) as valid for no expiration
    if (row['Fecha de Vencimiento']) {
      const expDateValue = row['Fecha de Vencimiento'];

      // Check if it's "S / F" or similar variations (case-insensitive, with or without spaces)
      const noExpirationValues = ['S / F', 'S/F', 'SF', 'SIN FECHA', 'WITHOUT DATE', 'N/A'];
      const normalizedExpDate = typeof expDateValue === 'string' ? expDateValue.trim().toUpperCase().replace(/\s+/g, ' ') : null;

      if (normalizedExpDate && noExpirationValues.includes(normalizedExpDate)) {
        // "S / F" means no expiration date - set to null
        mappedRow.expiration_date = null;
      } else {
        // Try to convert as a date
        const convertedExpDate = convertExcelDate(expDateValue);
        mappedRow.expiration_date = convertedExpDate;

        if (!convertedExpDate) {
          rowErrors.push(`Fila ${rowNumber}: Formato de Fecha de Vencimiento inválido. Use AAAA-MM-DD o "S / F" para sin vencimiento`);
        } else if (mappedRow.manufacturing_date) {
          // Validate expiration is after manufacturing
          const mfgDate = new Date(mappedRow.manufacturing_date);
          const expDate = new Date(convertedExpDate);

          if (!isNaN(mfgDate) && !isNaN(expDate) && expDate <= mfgDate) {
            rowErrors.push(`Fila ${rowNumber}: Fecha de Vencimiento debe ser posterior a Fecha de Fabricación`);
          }
        }
      }
    }

    // Presentation validation
    if (row['Presentación']) {
      if (!validPresentations.has(row['Presentación'])) {
        rowErrors.push(`Fila ${rowNumber}: Presentación inválida '${row['Presentación']}'. Opciones válidas: ${Array.from(validPresentations).join(', ')}`);
      } else {
        mappedRow.presentation = row['Presentación'];
      }
    } else {
      mappedRow.presentation = 'CAJA'; // Default
    }

    // Temperature range validation
    if (row['Rango de Temperatura']) {
      if (!validTemperatureRanges.has(row['Rango de Temperatura'])) {
        rowErrors.push(`Fila ${rowNumber}: Rango de Temperatura inválido '${row['Rango de Temperatura']}'. Opciones válidas: ${Array.from(validTemperatureRanges).join(', ')}`);
      } else {
        mappedRow.temperature_range = row['Rango de Temperatura'];
      }
    } else {
      mappedRow.temperature_range = 'AMBIENTE'; // Default
    }

    // Optional fields mapping
    const optionalFields = [
      ['Humedad', 'humidity'],
      ['Registro Sanitario', 'health_registration'],
      ['Descripción del Producto', 'product_description'],
      ['Especificación Técnica', 'technical_specification']
    ];

    optionalFields.forEach(([excelField, dbField]) => {
      if (row[excelField]) {
        mappedRow[dbField] = row[excelField];
      }
    });

    // Duplicate product detection within order (Product Code + Lot Series must be unique)
    if (mappedRow.order_index !== undefined && row['Código de Producto']) {
      if (!productsPerOrder.has(mappedRow.order_index)) {
        productsPerOrder.set(mappedRow.order_index, new Set());
      }

      const orderProducts = productsPerOrder.get(mappedRow.order_index);
      const lotSeries = row['Serie de Lote'] || '';
      const productKey = `${row['Código de Producto']}|${lotSeries}`; // Unique key: Product Code + Lot Series

      if (orderProducts.has(productKey)) {
        rowErrors.push(`Fila ${rowNumber}: Código de Producto duplicado '${row['Código de Producto']}' con Serie de Lote '${lotSeries}' en índice de orden ${mappedRow.order_index}`);
      } else {
        orderProducts.add(productKey);
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
async function processOrdersInBatches(orderHeaders, orderProducts, userId, userRole, organisationId, clientId = null) {
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

      // Calculate total weight from products (sum of all product weights)
      const totalWeight = orderProducts.reduce((sum, product) => {
        return sum + (parseFloat(product.weight_kg) || 0);
      }, 0);

      // Calculate total volume from products (sum of all product volumes)
      const totalVolume = orderProducts.reduce((sum, product) => {
        return sum + (parseFloat(product.volume_m3) || 0);
      }, 0);

      // Transform data to match existing createEntryOrder service
      const entryData = {
        entry_order_no: currentOrderNo,
        origin_id: orderHeader.origin_id,
        document_type_id: orderHeader.document_type_id,
        registration_date: orderHeader.registration_date,
        document_date: orderHeader.document_date,
        entry_date_time: orderHeader.entry_date_time,
        order_status: orderHeader.order_status || 'PENDIENTE',
        total_volume: totalVolume,
        total_weight: totalWeight,
        cif_value: orderHeader.cif_value,
        total_pallets: totalPallets,
        observation: orderHeader.observation,
        guide_number: orderHeader.guide_number,
        warehouse_id: orderHeader.warehouse_id,
        organisation_id: organisationId,
        created_by: userId,
        client_id: clientId,  // Add client_id for CLIENT users
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
      { Paso: 1, Instrucción: 'Complete la hoja Órdenes_Entrada con una fila por orden' },
      { Paso: 2, Instrucción: 'Complete la hoja Productos con todos los productos de cada orden' },
      { Paso: 3, Instrucción: 'Use nombres EXACTOS de las hojas de referencia (Orígenes, Proveedores, etc.)' },
      { Paso: 4, Instrucción: 'Para Tipos de Documento, seleccione de las opciones disponibles en la hoja TiposDocumento' },
      { Paso: 5, Instrucción: 'Los códigos de producto deben coincidir exactamente con la hoja Productos_Referencia' },
      { Paso: 6, Instrucción: 'Las fechas deben estar en formato AAAA-MM-DD' },
      { Paso: 7, Instrucción: 'La fecha-hora debe estar en formato AAAA-MM-DD HH:MM:SS' },
      { Paso: 8, Instrucción: 'Opciones de Rango de Temperatura: AMBIENTE, FRIO, CONGELADO' },
      { Paso: 9, Instrucción: 'Opciones de Presentación: CAJA, BLISTER, FRASCO, AMPOLLA, VIAL, SOBRE' },
      { Paso: 10, Instrucción: 'Cargue el archivo completado en la página de carga masiva' }
    ];

    // ENTRY ORDERS TEMPLATE - Using user-friendly names
    const entryOrdersTemplate = [
      {
        'Nombre del Origen': origins[0]?.name || 'Importación',
        'Personal a Cargo': users[0] ? `${users[0].first_name || ''} ${users[0].last_name || ''}`.trim() : 'Seleccionar de hoja Personal',
        'Nombre del Proveedor': suppliers[0]?.company_name || suppliers[0]?.name || 'Seleccionar de hoja Proveedores',
        'Fecha de Registro': '2025-01-15',
        'Fecha del Documento': '2025-01-15',
        'Fecha Hora de Admisión': '2025-01-15 14:30:00',
        'Valor CIF': '15000.00',
        'Número de Guía': 'GN001',
        'Observación': 'Orden de entrada de ejemplo - reemplace con sus datos'
      }
    ];

    // PRODUCTS TEMPLATE - Matching frontend form exactly
    const productsTemplate = [
      {
        'Índice de Orden': '0',
        'Código de Producto': products[0]?.product_code || 'Seleccionar de hoja Productos',
        'Nombre del Proveedor': suppliers[0]?.company_name || suppliers[0]?.name || 'Seleccionar de hoja Proveedores',
        'Número de Serie': 'SN001',
        'Serie de Lote': 'LOT001',
        'Fecha de Fabricación': '2024-01-01',
        'Fecha de Vencimiento': '2026-01-01',
        'Cantidad de Inventario': '100',
        'Cantidad de Paquetes': '10',
        'Peso (kg)': '50.0',
        'Volumen (m³)': '2.0',
        'Cantidad de Pallets': '1',
        'Presentación': 'CAJA',
        'Valor Asegurado': '1000.00',
        'Rango de Temperatura': 'AMBIENTE',
        'Humedad': '60%',
        'Registro Sanitario': 'HR001',
        'Descripción del Producto': 'Descripción del producto aquí',
        'Especificación Técnica': 'Especificaciones técnicas aquí'
      }
    ];

    // DOCUMENT UPLOADS TEMPLATE
    const documentsTemplate = [
      {
        'Índice de Orden': '0',
        'Tipo de Documento': documentTypes[0]?.name || 'Seleccionar de hoja TiposDocumento',
        'Nombre del Archivo': 'document1.pdf',
        'Notas': 'La carga de documentos se manejará por separado después del procesamiento del Excel'
      }
    ];

    // Add main sheets
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructions), 'Instrucciones');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(entryOrdersTemplate), 'Órdenes_Entrada');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsTemplate), 'Productos');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentsTemplate), 'Documentos');

    // Reference sheets for dropdown options
    const originsRef = origins.map(o => ({ Nombre: o.name, Tipo: o.type || 'N/A' }));
    const documentTypesRef = documentTypes.map(d => ({ Nombre: d.name, Tipo: d.type || 'N/A' }));
    const productsRef = products.map(p => ({
      'Código de Producto': p.product_code,
      'Nombre del Producto': p.name,
      'Fabricante': p.manufacturer || 'N/A'
    }));
    const suppliersRef = suppliers.map(s => ({
      'Nombre del Proveedor': s.company_name || s.name,
      'Empresa': s.company_name || 'N/A',
      'Contacto': s.name || 'N/A'
    }));
    const personnelRef = users.map(u => ({
      'Nombre del Personal': `${u.first_name || ''} ${u.last_name || ''}`.trim(),
      'Rol': u.role?.name || 'Desconocido'
    }));
    const temperatureRef = temperatureRanges.map(t => ({
      'Valor': t.value,
      'Descripción': t.label
    }));
    const presentationRef = presentationOptions.map(p => ({
      'Valor': p.value,
      'Descripción': p.label
    }));

    // Add reference sheets
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(originsRef), 'Orígenes');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentTypesRef), 'TiposDocumento');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsRef), 'Productos_Referencia');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(suppliersRef), 'Proveedores');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(personnelRef), 'Personal');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(temperatureRef), 'Opciones_Temperatura');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(presentationRef), 'Opciones_Presentación');

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