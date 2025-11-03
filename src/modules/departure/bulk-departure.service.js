const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");
const { getCurrentDepartureOrderNo, createDepartureOrder } = require("./departure.service");

const prisma = new PrismaClient();

/**
 * Process bulk departure orders from Excel file
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {string} userId - User ID creating the orders
 * @param {string} userRole - User role
 * @param {string} organisationId - Organisation ID
 * @returns {Object} Processing results with successful and failed orders
 */
async function processBulkDepartureOrders(fileBuffer, userId, userRole, organisationId) {
  console.log(`📊 BULK DEPARTURE: Starting bulk processing at ${new Date().toISOString()}`);

  try {
    // Parse Excel file
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Validate required sheets
    const requiredSheets = ['Departure_Orders', 'Products', 'Documents'];
    const missingSheets = requiredSheets.filter(sheet => !workbook.SheetNames.includes(sheet));

    if (missingSheets.length > 0) {
      throw new Error(`Missing required sheets: ${missingSheets.join(', ')}`);
    }

    // Parse each sheet
    const orderSheet = XLSX.utils.sheet_to_json(workbook.Sheets['Departure_Orders']);
    const productSheet = XLSX.utils.sheet_to_json(workbook.Sheets['Products']);
    const documentSheet = XLSX.utils.sheet_to_json(workbook.Sheets['Documents']);

    console.log(`📋 Parsed ${orderSheet.length} orders, ${productSheet.length} products, ${documentSheet.length} documents`);

    // Validate and transform data
    const { orderHeaders, orderProducts, orderDocuments } = await validateAndTransformData(
      orderSheet, productSheet, documentSheet, organisationId
    );

    // Process orders in batches
    const result = await processOrdersInBatches(orderHeaders, orderProducts, orderDocuments, userId, userRole, organisationId);

    console.log(`✅ BULK DEPARTURE: Completed processing ${result.successful_orders.length} successful, ${result.failed_orders.length} failed`);

    return result;

  } catch (error) {
    console.error('❌ Error in bulk departure processing:', error);
    throw new Error(`Bulk processing failed: ${error.message}`);
  }
}

/**
 * Validate and transform Excel data into database format
 */
async function validateAndTransformData(orderSheet, productSheet, documentSheet, organisationId) {
  const orderHeaders = [];
  const orderProducts = [];
  const orderDocuments = [];
  const errors = [];

  // Get reference data for validation
  const [clients, warehouses, documentTypes, products] = await Promise.all([
    prisma.client.findMany({ select: { client_id: true, company_name: true, first_names: true, last_name: true } }),
    prisma.warehouse.findMany({ select: { warehouse_id: true, name: true } }),
    prisma.documentType.findMany({ select: { document_type_id: true, name: true, type: true } }),
    prisma.product.findMany({ select: { product_id: true, product_code: true, name: true } })
  ]);

  // Create lookup maps
  const clientMap = new Map();
  clients.forEach(client => {
    const displayName = client.company_name || `${client.first_names} ${client.last_name}`.trim();
    clientMap.set(displayName, client.client_id);
  });

  const warehouseMap = new Map(warehouses.map(w => [w.name, w.warehouse_id]));
  const documentTypeMap = new Map(documentTypes.map(dt => [dt.name, dt.document_type_id]));
  const productCodeMap = new Map(products.map(p => [p.product_code, p]));

  // Validate and transform order headers
  orderSheet.forEach((row, index) => {
    const rowNumber = index + 2; // Excel row number (header is row 1)
    const rowErrors = [];

    // Required fields validation
    const requiredFields = [
      'Order Index', 'Client Name', 'Warehouse Name', 'Departure Date Time',
      'Document Date', 'Dispatch Document Number', 'Personnel In Charge'
    ];

    requiredFields.forEach(field => {
      if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') {
        rowErrors.push(`Row ${rowNumber}: ${field} is required`);
      }
    });

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    // Validate client exists
    const clientId = clientMap.get(row['Client Name']);
    if (!clientId) {
      errors.push(`Row ${rowNumber}: Client '${row['Client Name']}' not found`);
      return;
    }

    // Validate warehouse exists
    const warehouseId = warehouseMap.get(row['Warehouse Name']);
    if (!warehouseId) {
      errors.push(`Row ${rowNumber}: Warehouse '${row['Warehouse Name']}' not found`);
      return;
    }

    // Transform order data
    const orderData = {
      order_index: parseInt(row['Order Index']),
      client_id: clientId,
      warehouse_id: warehouseId,
      departure_date_time: new Date(row['Departure Date Time']),
      document_date: new Date(row['Document Date']),
      dispatch_document_number: row['Dispatch Document Number'],
      personnel_in_charge: row['Personnel In Charge'],
      observation: row['Observation'] || '',
      row_number: rowNumber
    };

    orderHeaders.push(orderData);
  });

  // Validate and transform products
  productSheet.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors = [];

    // Required product fields
    const requiredFields = [
      'Order Index', 'Product Code', 'Requested Quantity', 'Requested Packages'
    ];

    requiredFields.forEach(field => {
      if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') {
        rowErrors.push(`Row ${rowNumber}: ${field} is required`);
      }
    });

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    // Validate product exists
    const product = productCodeMap.get(row['Product Code']);
    if (!product) {
      errors.push(`Row ${rowNumber}: Product code '${row['Product Code']}' not found`);
      return;
    }

    // Validate order index exists in headers
    const orderIndex = parseInt(row['Order Index']);
    const orderExists = orderHeaders.find(order => order.order_index === orderIndex);
    if (!orderExists) {
      errors.push(`Row ${rowNumber}: Order Index ${orderIndex} not found in Departure_Orders sheet`);
      return;
    }

    // Transform product data
    const productData = {
      order_index: orderIndex,
      product_id: product.product_id,
      product_code: row['Product Code'],
      product_name: product.name,
      requested_quantity: parseInt(row['Requested Quantity']),
      requested_packages: parseInt(row['Requested Packages']),
      packaging_type: row['Packaging Type'] || 'NORMAL',
      packaging_status: row['Packaging Status'] || 'NORMAL',
      notes: row['Notes'] || '',
      row_number: rowNumber
    };

    orderProducts.push(productData);
  });

  // Validate and transform documents
  documentSheet.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors = [];

    // Required document fields
    const requiredFields = ['Order Index', 'Document Type', 'File Name'];

    requiredFields.forEach(field => {
      if (row[field] === undefined || row[field] === null || String(row[field]).trim() === '') {
        rowErrors.push(`Row ${rowNumber}: ${field} is required`);
      }
    });

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    // Validate document type exists
    const documentTypeId = documentTypeMap.get(row['Document Type']);
    if (!documentTypeId) {
      errors.push(`Row ${rowNumber}: Document type '${row['Document Type']}' not found`);
      return;
    }

    // Validate order index exists
    const orderIndex = parseInt(row['Order Index']);
    const orderExists = orderHeaders.find(order => order.order_index === orderIndex);
    if (!orderExists) {
      errors.push(`Row ${rowNumber}: Order Index ${orderIndex} not found in Departure_Orders sheet`);
      return;
    }

    // Transform document data
    const documentData = {
      order_index: orderIndex,
      document_type_id: documentTypeId,
      document_type_name: row['Document Type'],
      file_name: row['File Name'],
      notes: row['Notes'] || '',
      row_number: rowNumber
    };

    orderDocuments.push(documentData);
  });

  if (errors.length > 0) {
    throw new Error(`Validation errors:\n${errors.join('\n')}`);
  }

  return { orderHeaders, orderProducts, orderDocuments };
}

/**
 * Process orders sequentially to ensure proper order number generation
 */
async function processOrdersInBatches(orderHeaders, orderProducts, orderDocuments, userId, userRole, organisationId) {
  const successful_orders = [];
  const failed_orders = [];

  // Group products and documents by order index
  const productsByOrder = new Map();
  const documentsByOrder = new Map();

  orderProducts.forEach(product => {
    const orderIndex = product.order_index;
    if (!productsByOrder.has(orderIndex)) {
      productsByOrder.set(orderIndex, []);
    }
    productsByOrder.get(orderIndex).push(product);
  });

  orderDocuments.forEach(document => {
    const orderIndex = document.order_index;
    if (!documentsByOrder.has(orderIndex)) {
      documentsByOrder.set(orderIndex, []);
    }
    documentsByOrder.get(orderIndex).push(document);
  });

  // Get the starting order number for the batch
  const baseOrderNo = await getCurrentDepartureOrderNo();
  const yearPrefix = baseOrderNo.substring(0, 7); // "OS20252"
  const startingCount = parseInt(baseOrderNo.substring(7)); // Extract the number part

  console.log(`📦 Starting bulk processing with base order: ${baseOrderNo}`);

  // Process orders sequentially to ensure proper order number incrementation
  for (let i = 0; i < orderHeaders.length; i++) {
    const orderHeader = orderHeaders[i];

    console.log(`📦 Processing order ${i + 1}/${orderHeaders.length} (Order Index: ${orderHeader.order_index})`);

    try {
      const orderProductList = productsByOrder.get(orderHeader.order_index) || [];
      const orderDocumentList = documentsByOrder.get(orderHeader.order_index) || [];

      // Generate sequential order number for this batch
      const currentOrderNo = `${yearPrefix}${String(startingCount + i).padStart(2, "0")}`;
      console.log(`📦 Assigned order number: ${currentOrderNo}`);

      // Calculate total pallets (estimate based on products - can be refined later)
      const totalPallets = Math.max(1, Math.ceil(orderProductList.length / 5)); // Rough estimate

      // Prepare document type IDs
      const documentTypeIds = [...new Set(orderDocumentList.map(doc => doc.document_type_id))];

      // Create mock uploaded documents structure
      const uploadedDocuments = orderDocumentList.map(doc => ({
        file_name: doc.file_name,
        document_type: doc.document_type_name,
        notes: doc.notes,
        // Note: In real implementation, these would be actual file uploads
        file_path: `mock/path/${doc.file_name}`,
        file_size: 1024, // Mock size
        content_type: 'application/pdf' // Mock type
      }));

      // Transform data to match existing createDepartureOrder service
      const departureData = {
        departure_order_no: currentOrderNo,
        departure_date_time: orderHeader.departure_date_time,
        document_date: orderHeader.document_date,
        dispatch_document_number: orderHeader.dispatch_document_number,
        total_pallets: totalPallets,
        document_type_ids: documentTypeIds.length > 0 ? documentTypeIds : ['4cd70f81-eb64-4272-94ad-b6f644d80d22'], // Default to Factura
        uploaded_documents: uploadedDocuments.length > 0 ? uploadedDocuments : [{
          file_name: 'bulk_upload_placeholder.pdf',
          document_type: 'Factura',
          notes: 'Bulk upload - document placeholder'
        }],
        client_id: orderHeader.client_id,
        warehouse_id: orderHeader.warehouse_id,
        created_by: userId,
        organisation_id: organisationId,
        observation: orderHeader.observation,
        // Products for departure order
        products: orderProductList.map(product => ({
          product_id: product.product_id,
          product_code: product.product_code,
          requested_quantity: product.requested_quantity,
          requested_packages: product.requested_packages,
          packaging_type: product.packaging_type,
          packaging_status: product.packaging_status,
          notes: product.notes
        }))
      };

      // Use existing createDepartureOrder function for consistency
      const result = await createDepartureOrder(departureData);

      successful_orders.push({
        departure_order_no: currentOrderNo,
        departure_order_id: result.departureOrder.departure_order_id,
        products_count: orderProductList.length,
        documents_count: orderDocumentList.length
      });

    } catch (error) {
      failed_orders.push({
        departure_order_no: `Order ${orderHeader.order_index}`,
        error: error.message,
        row_number: orderHeader.row_number || (orderHeader.order_index + 2)
      });
    }
  }

  return { successful_orders, failed_orders };
}

/**
 * Generate Excel template for bulk departure orders - matches frontend requirements
 */
async function generateBulkDepartureTemplate(userId, userRole) {
  try {
    // Get reference data based on user role
    const [clients, warehouses, documentTypes, products, packagingTypes] = await Promise.all([
      prisma.client.findMany({
        select: {
          client_id: true,
          company_name: true,
          first_names: true,
          last_name: true,
          client_type: true
        }
      }),
      prisma.warehouse.findMany({
        select: { warehouse_id: true, name: true }
      }),
      prisma.documentType.findMany({
        select: { document_type_id: true, name: true, type: true }
      }),
      prisma.product.findMany({
        select: { product_id: true, product_code: true, name: true },
        take: 50 // Limit for template
      }),
      Promise.resolve([
        'NORMAL', 'PARTIALLY_DAMAGED', 'EXPIRED', 'RECALLED'
      ])
    ]);

    // Create sample data for template
    const sampleOrders = [
      {
        'Order Index': 0,
        'Client Name': clients[0]?.company_name || clients[0]?.first_names + ' ' + clients[0]?.last_name || 'Sample Client',
        'Warehouse Name': warehouses[0]?.name || 'Main Warehouse',
        'Departure Date Time': '2025-01-25 14:30:00',
        'Document Date': '2025-01-25',
        'Dispatch Document Number': 'DISP-2025-001',
        'Personnel In Charge': 'Warehouse Incharge',
        'Observation': 'Sample departure order for bulk template'
      },
      {
        'Order Index': 1,
        'Client Name': clients[1]?.company_name || clients[1]?.first_names + ' ' + clients[1]?.last_name || 'Sample Client 2',
        'Warehouse Name': warehouses[0]?.name || 'Main Warehouse',
        'Departure Date Time': '2025-01-26 10:00:00',
        'Document Date': '2025-01-26',
        'Dispatch Document Number': 'DISP-2025-002',
        'Personnel In Charge': 'Warehouse Incharge',
        'Observation': 'Second sample departure order'
      }
    ];

    const sampleProducts = [
      {
        'Order Index': 0,
        'Product Code': products[0]?.product_code || '23352',
        'Requested Quantity': 100,
        'Requested Packages': 10,
        'Packaging Type': 'NORMAL',
        'Packaging Status': 'NORMAL',
        'Notes': 'First product for departure'
      },
      {
        'Order Index': 1,
        'Product Code': products[1]?.product_code || '23356',
        'Requested Quantity': 50,
        'Requested Packages': 5,
        'Packaging Type': 'NORMAL',
        'Packaging Status': 'NORMAL',
        'Notes': 'Second product for departure'
      }
    ];

    const sampleDocuments = [
      {
        'Order Index': 0,
        'Document Type': documentTypes[0]?.name || 'Factura',
        'File Name': 'departure_invoice_001.pdf',
        'Notes': 'Invoice for first departure order'
      },
      {
        'Order Index': 1,
        'Document Type': documentTypes[1]?.name || 'Packing List',
        'File Name': 'departure_packing_002.pdf',
        'Notes': 'Packing list for second departure order'
      }
    ];

    // Reference data sheets
    const clientsReference = clients.map(client => ({
      'Client ID': client.client_id,
      'Client Name': client.company_name || `${client.first_names} ${client.last_name}`.trim(),
      'Type': client.client_type
    }));

    const warehousesReference = warehouses.map(warehouse => ({
      'Warehouse ID': warehouse.warehouse_id,
      'Warehouse Name': warehouse.name
    }));

    const productsReference = products.map(product => ({
      'Product Code': product.product_code,
      'Product Name': product.name
    }));

    const documentTypesReference = documentTypes.map(docType => ({
      'Document Type': docType.name,
      'Type Code': docType.type
    }));

    // Instructions
    const instructions = [
      { Step: 1, Instruction: 'Fill the Departure_Orders sheet with your departure order information' },
      { Step: 2, Instruction: 'Use Order Index (0, 1, 2...) to link orders with products and documents' },
      { Step: 3, Instruction: 'Fill the Products sheet with products to dispatch for each order' },
      { Step: 4, Instruction: 'Fill the Documents sheet with document references for each order' },
      { Step: 5, Instruction: 'Client Name must match exactly with names in Clients_Reference sheet' },
      { Step: 6, Instruction: 'Warehouse Name must match exactly with names in Warehouses_Reference sheet' },
      { Step: 7, Instruction: 'Product Code must match exactly with codes in Products_Reference sheet' },
      { Step: 8, Instruction: 'Document Type must match exactly with types in DocumentTypes_Reference sheet' },
      { Step: 9, Instruction: 'Departure Date Time format: YYYY-MM-DD HH:MM:SS' },
      { Step: 10, Instruction: 'Upload the completed file to the bulk departure upload page' }
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();

    // Add main sheets
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sampleOrders), 'Departure_Orders');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sampleProducts), 'Products');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sampleDocuments), 'Documents');

    // Add reference sheets
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clientsReference), 'Clients_Reference');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(warehousesReference), 'Warehouses_Reference');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsReference), 'Products_Reference');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(documentTypesReference), 'DocumentTypes_Reference');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(instructions), 'Instructions');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      success: true,
      message: "Departure bulk template generated successfully",
      buffer: buffer,
      filename: `bulk_departure_template_${new Date().toISOString().split('T')[0]}.xlsx`
    };

  } catch (error) {
    console.error('❌ Error generating bulk departure template:', error);
    throw new Error(`Failed to generate template: ${error.message}`);
  }
}

module.exports = {
  processBulkDepartureOrders,
  generateBulkDepartureTemplate
};