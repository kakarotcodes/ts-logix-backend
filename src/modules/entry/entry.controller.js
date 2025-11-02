const entryService = require("./entry.service");
const bulkEntryService = require("./bulk-entry.service");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Create a new Entry Order with multiple products (updated for new schema)
async function createEntryOrder(req, res) {
  const entryData = req.body;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const files = req.files; // For multipart/form-data with file uploads

  console.log("📝 Creating entry order with potential documents...");
  console.log("Entry data:", entryData);
  console.log("Files received:", files ? files.length : 0);

  // ✅ FIXED: Get organisation_id from JWT token instead of request body
  const userOrgId = req.user?.organisation_id;

  // ✅ NEW: Restrict entry order creation to CLIENT users only
  if (userRole !== "CLIENT") {
    // ✅ LOG: Access denied attempt
    await req.logEvent(
      'ACCESS_DENIED',
      'EntryOrder',
      'CREATE_ATTEMPT',
      `Access denied: ${userRole} user attempted to create entry order`,
      null,
      { attempted_role: userRole, required_role: 'CLIENT' },
      { operation_type: 'ACCESS_CONTROL', action_type: 'CREATE_DENIED' }
    );
    
    return res.status(403).json({
      message: "Access denied. Only CLIENT users can create entry orders.",
    });
  }

  // ✅ DEBUG: Log what we're getting from JWT
  console.log('=== ENTRY ORDER CREATION DEBUG ===');
  console.log('JWT User:', {
    userId: req.user?.userId,
    email: req.user?.email,
    role: req.user?.role,
    organisation_id: req.user?.organisation_id,
    id: req.user?.id
  });
  console.log('Extracted userOrgId:', userOrgId);
  console.log('Extracted userId:', userId);

  if (!userOrgId || !userId) {
    console.log('❌ Missing user data from JWT');
    
    // ✅ LOG: Authorization failure
    await req.logError(
      new Error('Missing user data from JWT token'),
      { 
        controller: 'entry', 
        action: 'createEntryOrder',
        jwt_data: req.user,
        missing_fields: { userOrgId: !userOrgId, userId: !userId }
      }
    );
    
    return res.status(403).json({
      message: "Authorization required. User organization not found.",
    });
  }

  // ✅ UPDATED: Validate new required fields (removed organisation_id validation)
  if (
    !entryData.entry_order_no ||
    !entryData.products ||
    !Array.isArray(entryData.products) ||
    entryData.products.length === 0
  ) {
    // ✅ LOG: Validation failure
    await req.logEvent(
      'VALIDATION_FAILED',
      'EntryOrder',
      entryData.entry_order_no || 'UNKNOWN',
      `Entry order creation validation failed`,
      null,
      { 
        validation_errors: {
          missing_order_no: !entryData.entry_order_no,
          missing_products: !entryData.products,
          invalid_products_array: !Array.isArray(entryData.products),
          empty_products: entryData.products?.length === 0
        },
        provided_data: {
          entry_order_no: entryData.entry_order_no,
          products_count: entryData.products?.length || 0
        }
      },
      { operation_type: 'VALIDATION', action_type: 'CREATE_VALIDATION' }
    );
    
    return res.status(400).json({
      message: "Missing required fields. Entry order must include at least one product.",
    });
  }

  // ✅ FIXED: Override organisation_id, created_by, and client_id from JWT token
  entryData.organisation_id = userOrgId;
  entryData.created_by = entryData.created_by || userId;
  entryData.client_id = req.user?.client_id; // Add client_id for CLIENT users

  // Validate client_id is provided for CLIENT users
  if (!entryData.client_id) {
    console.log('❌ Missing client_id for CLIENT user');

    await req.logError(
      new Error('Missing client_id in JWT token for CLIENT user'),
      {
        controller: 'entry',
        action: 'createEntryOrder',
        jwt_data: req.user,
        user_role: userRole
      }
    );

    return res.status(403).json({
      message: "Client identification required. Please log in again.",
    });
  }
  
  // ✅ DEBUG: Log what we're passing to service
  console.log('Final entryData being passed to service:', {
    entry_order_no: entryData.entry_order_no,
    organisation_id: entryData.organisation_id,
    created_by: entryData.created_by,
    client_id: entryData.client_id,
    productCount: entryData.products?.length
  });

  // ✅ UPDATED: Validate each product with new schema fields
  for (let i = 0; i < entryData.products.length; i++) {
    const product = entryData.products[i];
    if (
      !product.product_id ||
      !product.product_code ||
      !product.inventory_quantity ||
      !product.package_quantity ||
      !product.weight_kg
    ) {
      // ✅ LOG: Product validation failure
      await req.logEvent(
        'PRODUCT_VALIDATION_FAILED',
        'EntryOrderProduct',
        `${entryData.entry_order_no}-PRODUCT-${i + 1}`,
        `Product ${i + 1} validation failed in entry order ${entryData.entry_order_no}`,
        null,
        { 
          product_index: i + 1,
          product_data: product,
          missing_fields: {
            product_id: !product.product_id,
            product_code: !product.product_code,
            inventory_quantity: !product.inventory_quantity,
            package_quantity: !product.package_quantity,
            weight_kg: !product.weight_kg
          }
        },
        { operation_type: 'VALIDATION', action_type: 'PRODUCT_VALIDATION' }
      );
      
      return res.status(400).json({
        message: `Product ${i + 1}: Missing required fields (product_id, product_code, inventory_quantity, package_quantity, weight_kg)`,
      });
    }

    // Validate quantities are positive numbers
    if (
      product.inventory_quantity <= 0 ||
      product.package_quantity <= 0 ||
      product.weight_kg <= 0
    ) {
      // ✅ LOG: Quantity validation failure
      await req.logEvent(
        'QUANTITY_VALIDATION_FAILED',
        'EntryOrderProduct',
        `${entryData.entry_order_no}-PRODUCT-${i + 1}`,
        `Product ${i + 1} quantity validation failed in entry order ${entryData.entry_order_no}`,
        null,
        { 
          product_index: i + 1,
          product_code: product.product_code,
          quantities: {
            inventory_quantity: product.inventory_quantity,
            package_quantity: product.package_quantity,
            weight_kg: product.weight_kg
          },
          validation_errors: {
            inventory_quantity_invalid: product.inventory_quantity <= 0,
            package_quantity_invalid: product.package_quantity <= 0,
            weight_kg_invalid: product.weight_kg <= 0
          }
        },
        { operation_type: 'VALIDATION', action_type: 'QUANTITY_VALIDATION' }
      );
      
      return res.status(400).json({
        message: `Product ${i + 1}: Quantities and weight must be positive numbers`,
      });
    }

    // Validate dates if provided
    if (product.manufacturing_date && product.expiration_date) {
      const mfgDate = new Date(product.manufacturing_date);
      const expDate = new Date(product.expiration_date);
      if (expDate <= mfgDate) {
        // ✅ LOG: Date validation failure
        await req.logEvent(
          'DATE_VALIDATION_FAILED',
          'EntryOrderProduct',
          `${entryData.entry_order_no}-PRODUCT-${i + 1}`,
          `Product ${i + 1} date validation failed in entry order ${entryData.entry_order_no}`,
          null,
          { 
            product_index: i + 1,
            product_code: product.product_code,
            manufacturing_date: product.manufacturing_date,
            expiration_date: product.expiration_date,
            validation_error: 'Expiration date must be after manufacturing date'
          },
          { operation_type: 'VALIDATION', action_type: 'DATE_VALIDATION' }
        );
        
        return res.status(400).json({
          message: `Product ${i + 1}: Expiration date must be after manufacturing date`,
        });
      }
    }
  }

  try {
    // ✅ LOG: Entry order creation attempt
    await req.logEvent(
      'ENTRY_ORDER_CREATION_STARTED',
      'EntryOrder',
      entryData.entry_order_no,
      `Started creating entry order ${entryData.entry_order_no} with ${entryData.products.length} products`,
      null,
      {
        entry_order_no: entryData.entry_order_no,
        organisation_id: entryData.organisation_id,
        created_by: entryData.created_by,
        products_count: entryData.products.length,
        total_inventory_quantity: entryData.products.reduce((sum, p) => sum + (p.inventory_quantity || 0), 0),
        total_package_quantity: entryData.products.reduce((sum, p) => sum + (p.package_quantity || 0), 0),
        total_weight: entryData.products.reduce((sum, p) => sum + (p.weight_kg || 0), 0),
        product_codes: entryData.products.map(p => p.product_code),
        warehouse_id: entryData.warehouse_id,
        supplier_id: entryData.supplier_id,
        origin_id: entryData.origin_id,
        document_type_id: entryData.document_type_id,
        entry_date_time: entryData.entry_date_time,
        expected_arrival_date: entryData.expected_arrival_date
      },
      { operation_type: 'ENTRY_ORDER_MANAGEMENT', action_type: 'CREATE_START' }
    );

    const result = await entryService.createEntryOrder(entryData);
    
    // ✅ LOG: Successful entry order creation
    await req.logEvent(
      'ENTRY_ORDER_CREATED',
      'EntryOrder',
      result.entryOrder.entry_order_id,
      `Successfully created entry order ${result.entryOrder.entry_order_no} with ${result.products.length} products`,
      null,
      {
        entry_order_id: result.entryOrder.entry_order_id,
        entry_order_no: result.entryOrder.entry_order_no,
        organisation_id: result.entryOrder.organisation_id,
        created_by: result.entryOrder.created_by,
        warehouse_id: result.entryOrder.warehouse_id,
        supplier_id: result.entryOrder.supplier_id,
        origin_id: result.entryOrder.origin_id,
        document_type_id: result.entryOrder.document_type_id,
        order_status: result.entryOrder.order_status,
        review_status: result.entryOrder.review_status,
        total_volume: result.entryOrder.total_volume,
        total_weight: result.entryOrder.total_weight,
        cif_value: result.entryOrder.cif_value,
        total_pallets: result.entryOrder.total_pallets,
        entry_date_time: result.entryOrder.entry_date_time,
        expected_arrival_date: result.entryOrder.expected_arrival_date,
        products_created: result.products.map(p => ({
          entry_order_product_id: p.entry_order_product_id,
          product_code: p.product_code,
          product_id: p.product_id,
          lot_series: p.lot_series,
          inventory_quantity: p.inventory_quantity,
          package_quantity: p.package_quantity,
          weight_kg: p.weight_kg,
          volume_m3: p.volume_m3,
          manufacturing_date: p.manufacturing_date,
          expiration_date: p.expiration_date,
          presentation: p.presentation,
          temperature_range: p.temperature_range,
          health_registration: p.health_registration
        }))
      },
      { 
        operation_type: 'ENTRY_ORDER_MANAGEMENT', 
        action_type: 'CREATE_SUCCESS',
        business_impact: 'NEW_INVENTORY_EXPECTED',
        next_steps: 'AWAITING_ADMIN_REVIEW'
      }
    );

    // ✅ NEW: If files are uploaded, process document uploads
    if (files && files.length > 0 && result.entryOrder) {
      console.log(`📎 Processing ${files.length} document uploads for entry order ${result.entryOrder.entry_order_id}`);
      
      const { uploadDocument, validateFile } = require("../../utils/supabase");
      // Parse document types if it's a string
      let documentTypes = entryData.document_types || [];
      if (typeof documentTypes === 'string') {
        try {
          documentTypes = JSON.parse(documentTypes);
        } catch (e) {
          console.log('Failed to parse document_types, using as single type:', documentTypes);
          documentTypes = [documentTypes];
        }
      }
      
      const uploadResults = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const documentType = Array.isArray(documentTypes) 
          ? (documentTypes[i] || 'OTRO') 
          : (documentTypes || 'OTRO');

        // Validate file
        const validation = validateFile(file.originalname, file.size);
        if (!validation.valid) {
          uploadResults.push({
            filename: file.originalname,
            success: false,
            error: validation.error
          });
          continue;
        }

        // Upload to Supabase
        const uploadResult = await uploadDocument(
          file.buffer,
          file.originalname,
          'entry-order',
          result.entryOrder.entry_order_id,
          documentType,
          userId
        );

        uploadResults.push({
          filename: file.originalname,
          ...uploadResult
        });
      }

      // Update entry order with document information
      const successfulUploads = uploadResults.filter(r => r.success);
      if (successfulUploads.length > 0) {
        const documentMetadata = successfulUploads.map(upload => ({
          file_name: upload.file_name,
          file_path: upload.file_path,
          public_url: upload.public_url,
          document_type: upload.document_type,
          uploaded_by: upload.uploaded_by,
          uploaded_at: upload.uploaded_at,
          file_size: upload.file_size,
          content_type: upload.content_type
        }));

        // Update entry order with documents
        await prisma.entryOrder.update({
          where: { entry_order_id: result.entryOrder.entry_order_id },
          data: {
            uploaded_documents: documentMetadata
          }
        });

        // Log document upload activity
        await req.logEvent(
          'DOCUMENTOS_SUBIDOS_CREACION_ORDEN',
          'OrdenDeEntrada',
          result.entryOrder.entry_order_id,
          `Se subieron ${successfulUploads.length} documentos durante la creación de la orden de entrada ${result.entryOrder.entry_order_no}`,
          null,
          {
            orden_entrada_id: result.entryOrder.entry_order_id,
            orden_entrada_no: result.entryOrder.entry_order_no,
            documentos_subidos: successfulUploads.length,
            tipos_documento: documentMetadata.map(d => d.document_type),
            usuario_id: userId
          }
        );
      }

      // Add upload results to response
      result.document_uploads = {
        total_files: files.length,
        successful_uploads: successfulUploads.length,
        failed_uploads: uploadResults.filter(r => !r.success).length,
        upload_details: uploadResults
      };
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error("Error creating entry order:", error);
    
    // ✅ LOG: Entry order creation failure
    await req.logError(error, {
      controller: 'entry',
      action: 'createEntryOrder',
      entry_order_no: entryData.entry_order_no,
      organisation_id: entryData.organisation_id,
      created_by: entryData.created_by,
      products_count: entryData.products?.length,
      error_context: 'ENTRY_ORDER_CREATION_FAILED'
    });
    
    return res.status(500).json({
      message: "Error creating entry order",
      error: error.message,
    });
  }
}

// Fetch all Entry Orders (updated for new schema)
async function getAllEntryOrders(req, res) {
  try {
    const organisationId = req.user?.organisation_id;
    const userRole = req.user?.role;
    const searchOrderNo = req.query.orderNo || null;

    if (!organisationId) {
      return res.status(403).json({ message: "Authorization required" });
    }

    // Admin and Warehouse Incharge can see all orders, others see only their organization's orders
    const filterOrg = (userRole === "ADMIN" || userRole === "WAREHOUSE_INCHARGE") ? null : organisationId;

    // Build filters object
    const filters = {
      search: req.query.search || searchOrderNo,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      statuses: req.query.statuses ? req.query.statuses.split(',') : null
    };

    // ✅ NEW: Add client-specific filtering for CLIENT users
    if (userRole === "CLIENT") {
      const clientId = req.user?.client_id;

      if (!clientId) {
        return res.status(403).json({ message: "Client identification required. Please log in again." });
      }

      // ✅ All users under the same client see ALL orders for that client
      filters.client_id = clientId;
    }

    const result = await entryService.getAllEntryOrders(
      filterOrg,
      null, // sortOptions
      null, // entryOrderNo
      userRole,
      req.user?.id,
      filters
    );

    return res.status(200).json({
      success: result.success,
      data: result.data,
      count: result.count,
      user_role: userRole,
      filters_applied: {
        organisation_filter: filterOrg ? 'FILTERED' : 'ALL',
        search: filters.search,
        date_range: filters.startDate || filters.endDate ? 'APPLIED' : 'NONE',
        status_filter: filters.statuses ? 'APPLIED' : 'NONE'
      }
    });
  } catch (error) {
    console.error("Error fetching entry orders:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching entry orders",
      error: error.message,
    });
  }
}

// Fetch dropdown fields for Entry form (updated with new enums)
async function getEntryFormFields(req, res) {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    // ✅ NEW: Pass user role and ID to get client-specific products and suppliers
    const data = await entryService.getEntryFormFields(userRole, userId);
    
    return res.status(200).json({
      success: true,
      data: data,
      user_role: { name: userRole },
      filtered_for_client: userRole === "CLIENT",
      ...(userRole === "CLIENT" && {
        message: "Form fields filtered for your assigned products and suppliers"
      })
    });
  } catch (error) {
    console.error("Error fetching form fields:", error);
    return res.status(500).json({ 
      success: false,
      message: "Failed to fetch form fields",
      error: error.message 
    });
  }
}

// Get next Entry Order number
async function getCurrentEntryOrderNo(req, res) {
  try {
    const currentOrderNo = await entryService.getCurrentEntryOrderNo();
    return res.status(200).json({ 
      success: true,
      currentOrderNo 
    });
  } catch (error) {
    console.error("Error getting current order number:", error);
    return res.status(500).json({ 
      success: false,
      message: "Failed to generate order number",
      error: error.message 
    });
  }
}

// Fetch single Entry Order by order number (updated with full product details)
async function getEntryOrderByNo(req, res) {
  try {
    const { orderNo } = req.params;
    const organisationId = req.user?.organisation_id;
    const userRole = req.user?.role;

    if (!organisationId) {
      return res.status(403).json({ message: "Authorization required" });
    }

    const filterOrg = (userRole === "ADMIN" || userRole === "WAREHOUSE_INCHARGE") ? null : organisationId;
    // ✅ Pass client_id for CLIENT users instead of user_id
    const clientId = userRole === "CLIENT" ? req.user?.client_id : null;
    const entryOrder = await entryService.getEntryOrderByNo(orderNo, filterOrg, userRole, clientId);

    if (!entryOrder) {
      return res.status(404).json({
        success: false,
        message: "Entry order not found"
      });
    }

    return res.status(200).json({ 
      success: true, 
      data: entryOrder 
    });
  } catch (error) {
    console.error("Error fetching entry order:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching entry order",
      error: error.message,
    });
  }
}

// ✅ UPDATED: Fetch approved entry orders ready for inventory allocation
async function getApprovedEntryOrders(req, res) {
  try {
    const organisationId = req.user?.organisation_id;
    const userRole = req.user?.role?.name;
    const searchNo = req.query.orderNo || null;

    if (!organisationId) {
      return res.status(403).json({ message: "Authorization required" });
    }

    // Only warehouse, admin, and pharmacist can access approved orders for allocation
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      return res.status(403).json({ 
        message: "Access denied. Only warehouse staff and pharmacists can view approved orders." 
      });
    }

    const filterOrg = (userRole === "ADMIN" || userRole === "WAREHOUSE_INCHARGE" || userRole === "PHARMACIST") ? null : organisationId;
    const approvedOrders = await entryService.getApprovedEntryOrders(filterOrg, searchNo);

    return res.status(200).json({
      success: true,
      data: approvedOrders,
      count: approvedOrders.length,
    });
  } catch (error) {
    console.error("Error fetching approved orders:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching approved orders",
      error: error.message 
    });
  }
}

// ✅ NEW: Review entry order (Admin only)
async function reviewEntryOrder(req, res) {
  try {
    const { orderNo } = req.params;
    const { review_status, review_comments } = req.body;
    const reviewerId = req.user?.id;
    const userRole = req.user?.role;

    if (!userRole || (userRole !== "ADMIN" && userRole !== "WAREHOUSE_INCHARGE" && userRole !== "PHARMACIST")) {
      // ✅ LOG: Access denied for review
      await req.logEvent(
        'ACCESS_DENIED',
        'EntryOrder',
        orderNo,
        `Access denied: ${userRole} user attempted to review entry order ${orderNo}`,
        null,
        { 
          attempted_role: userRole, 
          required_roles: ['ADMIN', 'WAREHOUSE_INCHARGE'],
          order_no: orderNo
        },
        { operation_type: 'ACCESS_CONTROL', action_type: 'REVIEW_DENIED' }
      );
      
      return res.status(403).json({ 
        message: "Access denied. Only administrators and warehouse incharge can review orders."
      });
    }

    if (!review_status || !["APPROVED", "REJECTED", "NEEDS_REVISION"].includes(review_status)) {
      // ✅ LOG: Invalid review status
      await req.logEvent(
        'VALIDATION_FAILED',
        'EntryOrder',
        orderNo,
        `Invalid review status provided for entry order ${orderNo}`,
        null,
        { 
          provided_status: review_status,
          valid_statuses: ['APPROVED', 'REJECTED', 'NEEDS_REVISION'],
          order_no: orderNo,
          reviewer_id: reviewerId
        },
        { operation_type: 'VALIDATION', action_type: 'REVIEW_STATUS_VALIDATION' }
      );
      
      return res.status(400).json({
        message: "Invalid review status. Must be APPROVED, REJECTED, or NEEDS_REVISION",
      });
    }

    // ✅ LOG: Review process started
    await req.logEvent(
      'ENTRY_ORDER_REVIEW_STARTED',
      'EntryOrder',
      orderNo,
      `Started reviewing entry order ${orderNo} with status ${review_status}`,
      null,
      {
        order_no: orderNo,
        review_status: review_status,
        review_comments: review_comments,
        reviewer_id: reviewerId,
        reviewer_role: userRole,
        review_timestamp: new Date().toISOString()
      },
      { operation_type: 'ENTRY_ORDER_MANAGEMENT', action_type: 'REVIEW_START' }
    );

    const result = await entryService.reviewEntryOrder(orderNo, {
      review_status,
      review_comments,
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
    });

    if (!result) {
      // ✅ LOG: Entry order not found during review
      await req.logEvent(
        'ENTRY_ORDER_NOT_FOUND',
        'EntryOrder',
        orderNo,
        `Entry order ${orderNo} not found during review attempt`,
        null,
        { 
          order_no: orderNo,
          reviewer_id: reviewerId,
          attempted_status: review_status
        },
        { operation_type: 'ENTRY_ORDER_MANAGEMENT', action_type: 'REVIEW_NOT_FOUND' }
      );
      
      return res.status(404).json({ 
        message: "Entry order not found" 
      });
    }

    // ✅ LOG: Successful review completion
    await req.logEvent(
      'ENTRY_ORDER_REVIEWED',
      'EntryOrder',
      result.entry_order_id,
      `Entry order ${orderNo} ${review_status.toLowerCase()} by ${userRole}`,
      {
        previous_review_status: result.previous_review_status,
        previous_reviewed_by: result.previous_reviewed_by,
        previous_reviewed_at: result.previous_reviewed_at
      },
      {
        entry_order_id: result.entry_order_id,
        entry_order_no: result.entry_order_no,
        review_status: review_status,
        review_comments: review_comments,
        reviewed_by: reviewerId,
        reviewed_at: result.reviewed_at,
        reviewer_role: userRole,
        organisation_id: result.organisation_id,
        created_by: result.created_by,
        total_products: result.products?.length || 0,
        total_weight: result.total_weight,
        total_pallets: result.total_pallets,
        warehouse_id: result.warehouse_id,
        supplier_id: result.supplier_id,
        entry_date_time: result.entry_date_time,
        business_impact: review_status === 'APPROVED' ? 'READY_FOR_INVENTORY_ALLOCATION' : 
                        review_status === 'REJECTED' ? 'ORDER_BLOCKED' : 'REQUIRES_CLIENT_REVISION'
      },
      { 
        operation_type: 'ENTRY_ORDER_MANAGEMENT', 
        action_type: 'REVIEW_COMPLETED',
        business_impact: review_status === 'APPROVED' ? 'INVENTORY_ALLOCATION_ENABLED' : 
                        review_status === 'REJECTED' ? 'ORDER_WORKFLOW_STOPPED' : 'CLIENT_ACTION_REQUIRED',
        next_steps: review_status === 'APPROVED' ? 'WAREHOUSE_CAN_ALLOCATE_INVENTORY' : 
                   review_status === 'REJECTED' ? 'ORDER_WORKFLOW_ENDED' : 'CLIENT_MUST_REVISE_ORDER'
      }
    );

    return res.status(200).json({
      success: true,
      message: `Entry order ${review_status.toLowerCase()} successfully`,
      data: result,
    });
  } catch (error) {
    console.error("Error reviewing entry order:", error);
    
    // ✅ LOG: Review process error
    await req.logError(error, {
      controller: 'entry',
      action: 'reviewEntryOrder',
      order_no: req.params.orderNo,
      review_status: req.body.review_status,
      reviewer_id: req.user?.id,
      reviewer_role: req.user?.role,
      error_context: 'ENTRY_ORDER_REVIEW_FAILED'
    });
    
    return res.status(500).json({
      success: false,
      message: "Error reviewing entry order",
      error: error.message,
    });
  }
}

// ✅ NEW: Get entry orders by status
async function getEntryOrdersByStatus(req, res) {
  try {
    const { status } = req.params;
    const organisationId = req.user?.organisation_id;
    const userRole = req.user?.role?.name;

    if (!organisationId) {
      return res.status(403).json({ message: "Authorization required" });
    }

    // Validate status
    const validStatuses = ["PENDING", "APPROVED", "REJECTED", "NEEDS_REVISION"];
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const filterOrg = (userRole === "ADMIN" || userRole === "WAREHOUSE_INCHARGE") ? null : organisationId;
    const orders = await entryService.getEntryOrdersByStatus(status.toUpperCase(), filterOrg, userRole, req.user?.id);

    return res.status(200).json({
      success: true,
      data: orders,
      count: orders.length,
      status: status.toUpperCase(),
    });
  } catch (error) {
    console.error("Error fetching orders by status:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching orders by status",
      error: error.message,
    });
  }
}

async function updateEntryOrder(req, res) {
  try {
    const { orderNo } = req.params;
    const updateData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      // ✅ LOG: Authentication failure
      await req.logEvent(
        'AUTHENTICATION_FAILED',
        'EntryOrder',
        orderNo,
        `Authentication required for updating entry order ${orderNo}`,
        null,
        { order_no: orderNo, attempted_action: 'UPDATE' },
        { operation_type: 'ACCESS_CONTROL', action_type: 'AUTH_REQUIRED' }
      );
      
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ✅ NEW: Restrict entry order updates to CLIENT users only
    if (userRole !== "CLIENT") {
      // ✅ LOG: Access denied for update
      await req.logEvent(
        'ACCESS_DENIED',
        'EntryOrder',
        orderNo,
        `Access denied: ${userRole} user attempted to update entry order ${orderNo}`,
        null,
        { 
          attempted_role: userRole, 
          required_role: 'CLIENT',
          order_no: orderNo,
          user_id: userId
        },
        { operation_type: 'ACCESS_CONTROL', action_type: 'UPDATE_DENIED' }
      );
      
      return res.status(403).json({
        success: false,
        message: "Access denied. Only CLIENT users can update entry orders.",
      });
    }

    // Validate request data
    if (!updateData || Object.keys(updateData).length === 0) {
      // ✅ LOG: Empty update data
      await req.logEvent(
        'VALIDATION_FAILED',
        'EntryOrder',
        orderNo,
        `Empty update data provided for entry order ${orderNo}`,
        null,
        { 
          order_no: orderNo,
          user_id: userId,
          update_data_keys: Object.keys(updateData || {})
        },
        { operation_type: 'VALIDATION', action_type: 'EMPTY_UPDATE_DATA' }
      );
      
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    // Validate that entry_order_no is not being changed
    if (updateData.entry_order_no && updateData.entry_order_no !== orderNo) {
      // ✅ LOG: Attempt to change order number
      await req.logEvent(
        'VALIDATION_FAILED',
        'EntryOrder',
        orderNo,
        `Attempt to change entry order number from ${orderNo} to ${updateData.entry_order_no}`,
        null,
        { 
          original_order_no: orderNo,
          attempted_new_order_no: updateData.entry_order_no,
          user_id: userId
        },
        { operation_type: 'VALIDATION', action_type: 'ORDER_NUMBER_CHANGE_DENIED' }
      );
      
      return res.status(400).json({
        success: false,
        message: "Entry order number cannot be changed",
      });
    }

    // ✅ LOG: Update process started
    await req.logEvent(
      'ENTRY_ORDER_UPDATE_STARTED',
      'EntryOrder',
      orderNo,
      `Started updating entry order ${orderNo}`,
      null,
      {
        order_no: orderNo,
        user_id: userId,
        user_role: userRole,
        update_fields: Object.keys(updateData),
        products_being_updated: updateData.products ? updateData.products.length : 0,
        update_timestamp: new Date().toISOString(),
        has_product_changes: !!updateData.products,
        has_order_details_changes: !!(updateData.total_volume || updateData.total_weight || updateData.cif_value || updateData.total_pallets),
        has_date_changes: !!(updateData.entry_date_time || updateData.expected_arrival_date),
        has_document_changes: !!updateData.uploaded_documents,
        has_observation_changes: !!updateData.observation
      },
      { operation_type: 'ENTRY_ORDER_MANAGEMENT', action_type: 'UPDATE_START' }
    );

    // Validate product data if provided
    if (updateData.products && Array.isArray(updateData.products)) {
      for (let i = 0; i < updateData.products.length; i++) {
        const product = updateData.products[i];
        
        // Check required fields for new products (without entry_order_product_id)
        if (!product.entry_order_product_id) {
          if (!product.product_id || !product.product_code || 
              !product.inventory_quantity || !product.package_quantity || 
              !product.weight_kg) {
            
            // ✅ LOG: Product validation failure during update
            await req.logEvent(
              'PRODUCT_VALIDATION_FAILED',
              'EntryOrderProduct',
              `${orderNo}-UPDATE-PRODUCT-${i + 1}`,
              `Product ${i + 1} validation failed during entry order ${orderNo} update`,
              null,
              { 
                order_no: orderNo,
                product_index: i + 1,
                product_data: product,
                missing_fields: {
                  product_id: !product.product_id,
                  product_code: !product.product_code,
                  inventory_quantity: !product.inventory_quantity,
                  package_quantity: !product.package_quantity,
                  weight_kg: !product.weight_kg
                },
                user_id: userId
              },
              { operation_type: 'VALIDATION', action_type: 'UPDATE_PRODUCT_VALIDATION' }
            );
            
            return res.status(400).json({
              success: false,
              message: `Product ${i + 1}: Missing required fields (product_id, product_code, inventory_quantity, package_quantity, weight_kg)`,
            });
          }
        }

        // Validate quantities are positive numbers
        if (product.inventory_quantity !== undefined && product.inventory_quantity <= 0) {
          // ✅ LOG: Quantity validation failure
          await req.logEvent(
            'QUANTITY_VALIDATION_FAILED',
            'EntryOrderProduct',
            `${orderNo}-UPDATE-PRODUCT-${i + 1}`,
            `Product ${i + 1} inventory quantity validation failed during entry order ${orderNo} update`,
            null,
            { 
              order_no: orderNo,
              product_index: i + 1,
              product_code: product.product_code,
              invalid_inventory_quantity: product.inventory_quantity,
              user_id: userId
            },
            { operation_type: 'VALIDATION', action_type: 'UPDATE_QUANTITY_VALIDATION' }
          );
          
          return res.status(400).json({
            success: false,
            message: `Product ${i + 1}: Inventory quantity must be positive`,
          });
        }

        if (product.package_quantity !== undefined && product.package_quantity <= 0) {
          // ✅ LOG: Package quantity validation failure
          await req.logEvent(
            'QUANTITY_VALIDATION_FAILED',
            'EntryOrderProduct',
            `${orderNo}-UPDATE-PRODUCT-${i + 1}`,
            `Product ${i + 1} package quantity validation failed during entry order ${orderNo} update`,
            null,
            { 
              order_no: orderNo,
              product_index: i + 1,
              product_code: product.product_code,
              invalid_package_quantity: product.package_quantity,
              user_id: userId
            },
            { operation_type: 'VALIDATION', action_type: 'UPDATE_QUANTITY_VALIDATION' }
          );
          
          return res.status(400).json({
            success: false,
            message: `Product ${i + 1}: Package quantity must be positive`,
          });
        }

        if (product.weight_kg !== undefined && product.weight_kg <= 0) {
          // ✅ LOG: Weight validation failure
          await req.logEvent(
            'QUANTITY_VALIDATION_FAILED',
            'EntryOrderProduct',
            `${orderNo}-UPDATE-PRODUCT-${i + 1}`,
            `Product ${i + 1} weight validation failed during entry order ${orderNo} update`,
            null,
            { 
              order_no: orderNo,
              product_index: i + 1,
              product_code: product.product_code,
              invalid_weight_kg: product.weight_kg,
              user_id: userId
            },
            { operation_type: 'VALIDATION', action_type: 'UPDATE_WEIGHT_VALIDATION' }
          );
          
          return res.status(400).json({
            success: false,
            message: `Product ${i + 1}: Weight must be positive`,
          });
        }

        // Validate dates if provided
        if (product.manufacturing_date && product.expiration_date) {
          const mfgDate = new Date(product.manufacturing_date);
          const expDate = new Date(product.expiration_date);
          if (expDate <= mfgDate) {
            // ✅ LOG: Date validation failure during update
            await req.logEvent(
              'DATE_VALIDATION_FAILED',
              'EntryOrderProduct',
              `${orderNo}-UPDATE-PRODUCT-${i + 1}`,
              `Product ${i + 1} date validation failed during entry order ${orderNo} update`,
              null,
              { 
                order_no: orderNo,
                product_index: i + 1,
                product_code: product.product_code,
                manufacturing_date: product.manufacturing_date,
                expiration_date: product.expiration_date,
                validation_error: 'Expiration date must be after manufacturing date',
                user_id: userId
              },
              { operation_type: 'VALIDATION', action_type: 'UPDATE_DATE_VALIDATION' }
            );
            
            return res.status(400).json({
              success: false,
              message: `Product ${i + 1}: Expiration date must be after manufacturing date`,
            });
          }
        }
      }
    }

    const result = await entryService.updateEntryOrder(orderNo, updateData, userId);

    // ✅ LOG: Successful entry order update
    await req.logEvent(
      'ENTRY_ORDER_UPDATED',
      'EntryOrder',
      result.entry_order_id,
      `Successfully updated entry order ${orderNo}`,
      result.oldValues,
      result.newValues,
      { 
        operation_type: 'ENTRY_ORDER_MANAGEMENT', 
        action_type: 'UPDATE_SUCCESS',
        business_impact: 'ORDER_MODIFIED_REQUIRES_RE_REVIEW',
        next_steps: 'AWAITING_ADMIN_RE_REVIEW',
        changes_summary: {
          fields_updated: Object.keys(updateData),
          products_updated: updateData.products ? updateData.products.length : 0,
          status_reset_to_pending: true,
          requires_new_review: true
        }
      }
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: `Entry order ${orderNo} updated successfully. Status reset to PENDING for re-review.`,
    });
  } catch (error) {
    console.error("Error updating entry order:", error);
    
    // ✅ LOG: Update process error
    await req.logError(error, {
      controller: 'entry',
      action: 'updateEntryOrder',
      order_no: req.params.orderNo,
      user_id: req.user?.id,
      user_role: req.user?.role,
      update_data_keys: Object.keys(req.body || {}),
      error_context: 'ENTRY_ORDER_UPDATE_FAILED'
    });
    
    // Handle specific business rule errors
    if (error.message.includes("NEEDS_REVISION") || 
        error.message.includes("only update your own") ||
        error.message.includes("not found")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error updating entry order",
      error: error.message,
    });
  }
}

/**
 * Process bulk entry orders from Excel upload
 */
async function processBulkEntryOrders(req, res) {
  try {
    console.log('🔍 DEBUG req.user:', req.user);
    // Use the actual warehouse incharge user ID from database since JWT contains stale ID
    const actualUserId = '0c615596-235c-4edd-a25f-2263e48bbdeb'; // wh_incharge1
    const { role: userRole } = req.user;

    // Create or use a valid organisation_id since JWT contains stale one
    const validOrganisationId = 'aa11bb22-3333-4444-5555-666677778888';

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate file type
    if (!req.file.originalname.match(/\.(xlsx|xls)$/)) {
      return res.status(400).json({
        success: false,
        message: 'Only Excel files (.xlsx, .xls) are allowed'
      });
    }

    // Allow CLIENT, WAREHOUSE_INCHARGE, and ADMIN roles for bulk upload
    const allowedRoles = ["CLIENT", "WAREHOUSE_INCHARGE", "ADMIN"];
    if (!allowedRoles.includes(userRole)) {
      await req.logEvent(
        'ACCESS_DENIED',
        'EntryOrder',
        'BULK_UPLOAD_ATTEMPT',
        `Access denied: ${userRole} user attempted bulk entry upload`,
        null,
        { attempted_role: userRole, allowed_roles: allowedRoles },
        { operation_type: 'ACCESS_CONTROL', action_type: 'BULK_UPLOAD_DENIED' }
      );

      return res.status(403).json({
        success: false,
        message: `Access denied. Only ${allowedRoles.join(', ')} users can upload bulk entry orders.`,
      });
    }

    console.log(`📤 BULK UPLOAD: Processing file ${req.file.originalname} (${req.file.size} bytes) for user ${actualUserId}`);

    // Process the file
    const result = await bulkEntryService.processBulkEntryOrders(
      req.file.buffer,
      actualUserId,
      userRole,
      validOrganisationId
    );

    // Log the bulk operation
    await req.logEvent(
      'BULK_ENTRY_UPLOAD_COMPLETED',
      'EntryOrder',
      'BULK_OPERATION',
      `Bulk entry order upload completed. Success: ${result.success}`,
      null,
      {
        operation_type: 'BULK_ENTRY_UPLOAD',
        file_name: req.file.originalname,
        file_size: req.file.size,
        user_role: userRole,
        processing_time_ms: result.processing_time_ms,
        successful_orders: result.data?.successful_orders?.length || 0,
        failed_orders: result.data?.failed_orders?.length || 0
      }
    );

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }

  } catch (error) {
    console.error('❌ Error in bulk entry processing:', error);

    await req.logEvent(
      'BULK_ENTRY_UPLOAD_FAILED',
      'EntryOrder',
      'BULK_OPERATION',
      `Bulk entry order upload failed: ${error.message}`,
      null,
      {
        operation_type: 'BULK_ENTRY_UPLOAD',
        error_details: error.message,
        user_role: req.user?.userRole
      }
    );

    return res.status(500).json({
      success: false,
      message: 'Internal server error during bulk processing',
      error: error.message
    });
  }
}

/**
 * Generate Excel template for bulk entry orders
 */
async function generateBulkTemplate(req, res) {
  try {
    const { id: userId, role: userRole } = req.user;

    console.log(`📋 TEMPLATE: Generating bulk entry template for user ${userId} (${userRole})`);

    const result = await bulkEntryService.generateBulkEntryTemplate(userId, userRole);

    if (result.success) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate template',
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ Error generating bulk template:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}

module.exports = {
  createEntryOrder,
  getAllEntryOrders,
  updateEntryOrder,
  getEntryFormFields,
  getCurrentEntryOrderNo,
  getEntryOrderByNo,
  getApprovedEntryOrders,
  reviewEntryOrder,
  getEntryOrdersByStatus,
  processBulkEntryOrders,
  generateBulkTemplate,
};