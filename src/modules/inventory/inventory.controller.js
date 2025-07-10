const inventoryService = require("./inventory.service");
const { CellStatus } = require("@prisma/client");

/** Get approved entry orders ready for inventory assignment */
async function getApprovedEntryOrdersForInventory(req, res) {
  try {
    const userRole = req.user?.role;
    const organisationId = req.user?.organisation_id;

    // Only warehouse, admin, and pharmacist can access
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      return res.status(403).json({ 
        message: "Access denied. Only warehouse staff and pharmacists can access inventory assignment." 
      });
    }

    const orders = await inventoryService.getApprovedEntryOrdersForInventory(organisationId);
    
    return res.json({
      success: true,
      count: orders.length,
      data: orders,
      message: "Approved entry orders ready for inventory assignment",
    });
  } catch (err) {
    console.error("Error fetching approved entry orders:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Get specific entry order products for inventory assignment */
async function getEntryOrderProductsForInventory(req, res) {
  try {
    const { entryOrderId } = req.params;
    const userRole = req.user?.role;

    // Only warehouse, admin, and pharmacist can access
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      return res.status(403).json({ 
        message: "Access denied. Only warehouse staff and pharmacists can access inventory assignment." 
      });
    }

    const products = await inventoryService.getEntryOrderProductsForInventory(entryOrderId);
    
    return res.json({
      success: true,
      count: products.length,
      data: products,
      message: "Entry order products ready for inventory assignment",
    });
  } catch (err) {
    console.error("Error fetching entry order products:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Assign a specific product to a warehouse cell */
async function assignProductToCell(req, res) {
  try {
    const {
      entry_order_product_id,
      cell_id,
      inventory_quantity,
      package_quantity,
      quantity_pallets,
      presentation,
      weight_kg,
      volume_m3,
      guide_number,
      product_status,
      uploaded_documents,
      observations,
      warehouse_id,
    } = req.body;

    const userRole = req.user?.role;
    const userId = req.user?.id;

    // ✅ UPDATED: Only warehouse staff can do inventory allocation (CLIENT users cannot)
    if (!["WAREHOUSE_INCHARGE", "ADMIN", "PHARMACIST"].includes(userRole)) {
      // ✅ LOG: Access denied for inventory allocation
      await req.logEvent(
        'ACCESS_DENIED',
        'InventoryAllocation',
        `${entry_order_product_id}-${cell_id}`,
        `Access denied: ${userRole} user attempted to assign inventory to cell`,
        null,
        { 
          attempted_role: userRole, 
          required_roles: ['WAREHOUSE_INCHARGE', 'ADMIN', 'PHARMACIST'],
          entry_order_product_id: entry_order_product_id,
          cell_id: cell_id,
          user_id: userId
        },
        { operation_type: 'ACCESS_CONTROL', action_type: 'INVENTORY_ALLOCATION_DENIED' }
      );
      
      return res.status(403).json({
        success: false,
        message: "Access denied. Only WAREHOUSE_INCHARGE, ADMIN, and PHARMACIST users can assign inventory to cells.",
      });
    }

    // ✅ VALIDATION: Ensure all required fields are provided
    const requiredFields = {
      entry_order_product_id: "Entry Order Product ID",
      cell_id: "Cell ID",
      inventory_quantity: "Inventory Quantity",
      package_quantity: "Package Quantity",
      presentation: "Presentation",
      weight_kg: "Weight (kg)",
      warehouse_id: "Warehouse ID",
    };

    const missingFields = [];
    for (const [field, displayName] of Object.entries(requiredFields)) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "") {
        missingFields.push(displayName);
      }
    }

    if (missingFields.length > 0) {
      // ✅ LOG: Validation failure for missing fields
      await req.logEvent(
        'VALIDATION_FAILED',
        'InventoryAllocation',
        `${entry_order_product_id}-${cell_id}`,
        `Inventory allocation validation failed: missing required fields`,
        null,
        { 
          entry_order_product_id: entry_order_product_id,
          cell_id: cell_id,
          missing_fields: missingFields,
          provided_fields: Object.keys(req.body),
          user_id: userId,
          user_role: userRole
        },
        { operation_type: 'VALIDATION', action_type: 'INVENTORY_ALLOCATION_VALIDATION' }
      );
      
      return res.status(400).json({
        success: false,
        message: `${missingFields[0]} is required and cannot be empty`,
      });
    }

    // ✅ VALIDATION: Ensure numeric fields are positive
    const numericFields = {
      inventory_quantity: "Inventory Quantity",
      package_quantity: "Package Quantity",
      weight_kg: "Weight",
    };

    const invalidNumericFields = [];
    for (const [field, displayName] of Object.entries(numericFields)) {
      const value = parseFloat(req.body[field]);
      if (isNaN(value) || value <= 0) {
        invalidNumericFields.push({ field: displayName, value: req.body[field] });
      }
    }

    if (invalidNumericFields.length > 0) {
      // ✅ LOG: Numeric validation failure
      await req.logEvent(
        'QUANTITY_VALIDATION_FAILED',
        'InventoryAllocation',
        `${entry_order_product_id}-${cell_id}`,
        `Inventory allocation quantity validation failed`,
        null,
        { 
          entry_order_product_id: entry_order_product_id,
          cell_id: cell_id,
          invalid_fields: invalidNumericFields,
          user_id: userId,
          user_role: userRole
        },
        { operation_type: 'VALIDATION', action_type: 'INVENTORY_QUANTITY_VALIDATION' }
      );
      
      return res.status(400).json({
        success: false,
        message: `${invalidNumericFields[0].field} must be a positive number`,
      });
    }

    // ✅ LOG: Inventory allocation process started
    await req.logEvent(
      'INVENTORY_ALLOCATION_STARTED',
      'InventoryAllocation',
      `${entry_order_product_id}-${cell_id}`,
      `Started inventory allocation process for entry order product ${entry_order_product_id} to cell ${cell_id}`,
      null,
      {
        entry_order_product_id: entry_order_product_id,
        cell_id: cell_id,
        warehouse_id: warehouse_id,
        allocated_by: userId,
        allocator_role: userRole,
        allocation_details: {
          inventory_quantity: parseInt(inventory_quantity),
          package_quantity: parseInt(package_quantity),
          quantity_pallets: parseInt(quantity_pallets) || null,
          presentation: presentation,
          weight_kg: parseFloat(weight_kg),
          volume_m3: volume_m3 ? parseFloat(volume_m3) : null,
          product_status: product_status,
          guide_number: guide_number,
          observations: observations
        },
        has_uploaded_documents: !!uploaded_documents,
        allocation_timestamp: new Date().toISOString()
      },
      { operation_type: 'INVENTORY_MANAGEMENT', action_type: 'ALLOCATION_START' }
    );

    const result = await inventoryService.assignProductToCell({
      entry_order_product_id,
      cell_id,
      assigned_by: userId,
      inventory_quantity: parseInt(inventory_quantity),
      package_quantity: parseInt(package_quantity),
      quantity_pallets: parseInt(quantity_pallets) || null,
      presentation,
      weight_kg: parseFloat(weight_kg),
      volume_m3: volume_m3 ? parseFloat(volume_m3) : null,
      guide_number,
      product_status,
      uploaded_documents,
      observations,
      warehouse_id,
    });

    // ✅ LOG: Successful inventory allocation
    await req.logEvent(
      'INVENTORY_ALLOCATED',
      'InventoryAllocation',
      result.allocation.allocation_id,
      `Successfully allocated ${inventory_quantity} units of ${result.product.name} to cell ${result.cellReference} in quarantine status`,
      null,
      {
        allocation_id: result.allocation.allocation_id,
        inventory_id: result.inventory.inventory_id,
        entry_order_product_id: entry_order_product_id,
        cell_id: cell_id,
        cell_reference: result.cellReference,
        warehouse_id: warehouse_id,
        allocated_by: userId,
        allocator_role: userRole,
        product_details: {
          product_id: result.product.product_id,
          product_code: result.product.product_code,
          product_name: result.product.name,
          manufacturer: result.product.manufacturer
        },
        allocation_quantities: {
          inventory_quantity: parseInt(inventory_quantity),
          package_quantity: parseInt(package_quantity),
          quantity_pallets: parseInt(quantity_pallets) || null,
          weight_kg: parseFloat(weight_kg),
          volume_m3: volume_m3 ? parseFloat(volume_m3) : null
        },
        quality_status: "CUARENTENA",
        product_status: product_status,
        presentation: presentation,
        guide_number: guide_number,
        observations: observations,
        has_uploaded_documents: !!uploaded_documents,
        cell_status_updated: true,
        inventory_log_created: true,
        business_impact: "INVENTORY_IN_QUARANTINE_AWAITING_QC"
      },
      { 
        operation_type: 'INVENTORY_MANAGEMENT', 
        action_type: 'ALLOCATION_SUCCESS',
        business_impact: 'INVENTORY_QUARANTINED',
        next_steps: 'QUALITY_CONTROL_REVIEW_REQUIRED'
      }
    );

    return res.status(201).json({
      success: true,
      message: `Successfully assigned ${inventory_quantity} units of ${result.product.name} to cell ${result.cellReference} in quarantine status`,
      data: {
        allocation: result.allocation,
        inventory: result.inventory,
        cell_reference: result.cellReference,
        product: result.product,
        quality_status: "CUARENTENA",
        next_step: "Quality control review required before inventory becomes available",
      },
    });
  } catch (err) {
    console.error("Error in assignProductToCell:", err);
    
    // ✅ LOG: Inventory allocation failure
    await req.logError(err, {
      controller: 'inventory',
      action: 'assignProductToCell',
      entry_order_product_id: req.body.entry_order_product_id,
      cell_id: req.body.cell_id,
      warehouse_id: req.body.warehouse_id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      allocation_data: {
        inventory_quantity: req.body.inventory_quantity,
        package_quantity: req.body.package_quantity,
        weight_kg: req.body.weight_kg,
        presentation: req.body.presentation
      },
      error_context: 'INVENTORY_ALLOCATION_FAILED'
    });
    
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}

/** Get available cells for a specific warehouse (STRICT CLIENT FILTERING - entry_order_id required for warehouse staff) */
async function getAvailableCellsForWarehouse(req, res) {
  try {
    const { warehouse_id } = req.params;
    const { entry_order_id } = req.query; // ✅ REQUIRED for warehouse staff
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!warehouse_id) {
      return res.status(400).json({
        success: false,
        message: "Warehouse ID is required",
      });
    }

    // ✅ OPTION A: STRICT CLIENT FILTERING - Always require context
    let cells;
    let debugInfo = null;
    let message = "";
    
    if (userRole === "CLIENT") {
      // For clients, only show cells assigned to them (existing logic)
      const clientResult = await inventoryService.getClientAssignedCells(warehouse_id, userId);
      
      if (clientResult && typeof clientResult === 'object' && clientResult.cells) {
        cells = clientResult.cells;
        debugInfo = clientResult.debug_info;
      } else {
        cells = clientResult || [];
      }
      message = "Available cells assigned to you in warehouse";
    } else {
      // ✅ STRICT: Warehouse staff MUST provide entry_order_id
      if (!entry_order_id) {
        return res.status(400).json({
          success: false,
          message: "entry_order_id parameter is required for warehouse staff to ensure proper client-based filtering",
          suggestion: "Add ?entry_order_id=<entry_order_id> to see cells assigned to the specific client",
          user_role: userRole,
          strict_filtering: true
        });
      }

      // Apply client-based filtering using entry_order_id
      cells = await inventoryService.getAvailableCells(warehouse_id, entry_order_id);
      
      // Check if filtering was applied by looking for client assignment info
      const hasClientFiltering = cells.some(cell => cell.is_client_assigned);
      if (hasClientFiltering) {
        message = "Available cells assigned to the client who created this entry order";
      } else {
        message = "Available cells in warehouse (entry order created by non-CLIENT user)";
      }
    }
    
    const response = {
      success: true,
      count: cells.length,
      data: cells,
      message: message,
      user_role: userRole,
      entry_order_filtering: !!entry_order_id, // ✅ NEW: Indicate if entry order filtering was applied
    };
    
    // Include debug info for CLIENT users
    if (debugInfo) {
      response.debug = debugInfo;
    }
    
    return res.json(response);
  } catch (err) {
    console.error("Error fetching available cells:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Get inventory summary */
async function getInventorySummary(req, res) {
  try {
    const summary = await inventoryService.getInventorySummary(req.query);
    
    return res.json({
      success: true,
      count: summary.length,
      data: summary,
    });
  } catch (err) {
    console.error("Error fetching inventory summary:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Fetch all warehouses */
async function fetchWarehouses(req, res) {
  try {
    const warehouses = await inventoryService.getAllWarehouses();
    return res.json({ 
      success: true, 
      data: warehouses 
    });
  } catch (err) {
    console.error("Error fetching warehouses:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Fetch warehouse cells with optional status filter */
async function fetchCells(req, res) {
  try {
    const warehouseId = req.params.warehouse_id;
    const statusParam = req.query.status;
    const statusFilter = statusParam && CellStatus[statusParam] ? CellStatus[statusParam] : null;
    
    const cells = await inventoryService.getWarehouseCells(warehouseId, statusFilter);
    
    return res.json({ 
      success: true, 
      count: cells.length, 
      data: cells 
    });
  } catch (err) {
    console.error("Error fetching cells:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Get inventory allocations in quarantine for quality control */
async function getQuarantineInventory(req, res) {
  try {
    const userRole = req.user?.role;
    const { warehouse_id } = req.query;

    // Only warehouse, admin, and pharmacist can access quality control
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      return res.status(403).json({ 
        message: "Access denied. Only warehouse staff and pharmacists can access quality control." 
      });
    }

    const quarantineItems = await inventoryService.getQuarantineInventory(warehouse_id);
    
    return res.json({
      success: true,
      count: quarantineItems.length,
      data: quarantineItems.map(item => ({
        ...item,
        cellReference: `${item.cell.row}.${String(item.cell.bay).padStart(2, "0")}.${String(item.cell.position).padStart(2, "0")}`,
        allocator_name: `${item.allocator.first_name || ""} ${item.allocator.last_name || ""}`.trim(),
        warehouse_name: item.cell.warehouse.name,
      })),
      message: "Quarantine inventory retrieved successfully",
    });
  } catch (err) {
    console.error("Error fetching quarantine inventory:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** ✅ NEW: Get inventory allocations by any quality status (dynamic) */
async function getInventoryByQualityStatus(req, res) {
  try {
    const userRole = req.user?.role;
    const { quality_status, warehouse_id } = req.query;

    // Only warehouse, admin, and pharmacist can access quality control
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      return res.status(403).json({ 
        message: "Access denied. Only warehouse staff and pharmacists can access quality control." 
      });
    }

    // Validate required parameter
    if (!quality_status) {
      return res.status(400).json({
        success: false,
        message: "quality_status parameter is required. Valid values: CUARENTENA, APROBADO, DEVOLUCIONES, CONTRAMUESTRAS, RECHAZADOS",
      });
    }

    const inventoryItems = await inventoryService.getInventoryByQualityStatus(quality_status, warehouse_id);
    
    // Transform data for better readability
    const transformedData = inventoryItems.map(item => ({
      ...item,
      cellReference: `${item.cell.row}.${String(item.cell.bay).padStart(2, "0")}.${String(item.cell.position).padStart(2, "0")}`,
      allocator_name: `${item.allocator.first_name || ""} ${item.allocator.last_name || ""}`.trim(),
      last_modifier_name: item.lastModifier ? `${item.lastModifier.first_name || ""} ${item.lastModifier.last_name || ""}`.trim() : null,
      warehouse_name: item.cell.warehouse.name,
      warehouse_location: item.cell.warehouse.location,
      supplier_name: item.entry_order_product.supplier?.name,
      creator_name: `${item.entry_order_product.entry_order.creator.first_name || ""} ${item.entry_order_product.entry_order.creator.last_name || ""}`.trim(),
      organisation_name: item.entry_order_product.entry_order.creator.organisation.name,
      
      // Summary fields
      total_quantity: item.inventory?.current_quantity || item.inventory_quantity,
      total_packages: item.inventory?.current_package_quantity || item.package_quantity,
      total_weight: item.inventory?.current_weight || item.weight_kg,
      total_volume: item.inventory?.current_volume || item.volume_m3,
    }));

    // Get summary statistics
    const summary = {
      total_items: transformedData.length,
      total_quantity: transformedData.reduce((sum, item) => sum + (item.total_quantity || 0), 0),
      total_packages: transformedData.reduce((sum, item) => sum + (item.total_packages || 0), 0),
      total_weight: transformedData.reduce((sum, item) => sum + parseFloat(item.total_weight || 0), 0),
      total_volume: transformedData.reduce((sum, item) => sum + parseFloat(item.total_volume || 0), 0),
      warehouses: [...new Set(transformedData.map(item => item.warehouse_name))],
      products: [...new Set(transformedData.map(item => item.entry_order_product.product.product_code))].length,
    };

    return res.json({
      success: true,
      count: transformedData.length,
      data: transformedData,
      summary: summary,
      filters: {
        quality_status: quality_status,
        warehouse_id: warehouse_id || "all",
      },
      message: `Inventory with quality status '${quality_status}' retrieved successfully`,
    });
  } catch (err) {
    console.error("Error fetching inventory by quality status:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Transition inventory from quarantine to other quality states */
async function transitionQualityStatus(req, res) {
  try {
    const {
      allocation_id,
      to_status,
      quantity_to_move,
      package_quantity_to_move,
      weight_to_move,
      volume_to_move,
      reason,
      notes,
      new_cell_id,
    } = req.body;

    const userRole = req.user?.role;
    const userId = req.user?.id;

    // Only warehouse, admin, and pharmacist can perform quality transitions
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      // ✅ LOG: Access denied for quality transition
      await req.logEvent(
        'ACCESS_DENIED',
        'QualityControlTransition',
        allocation_id || 'UNKNOWN',
        `Access denied: ${userRole} user attempted to perform quality transition`,
        null,
        { 
          attempted_role: userRole, 
          required_roles: ['WAREHOUSE_INCHARGE', 'ADMIN'],
          allocation_id: allocation_id,
          to_status: to_status,
          user_id: userId
        },
        { operation_type: 'ACCESS_CONTROL', action_type: 'QUALITY_TRANSITION_DENIED' }
      );
      
      return res.status(403).json({ 
        message: "Access denied. Only warehouse staff can perform quality transitions." 
      });
    }

    // Validate required fields
    if (!allocation_id || !to_status || !quantity_to_move || !reason) {
      // ✅ LOG: Validation failure for quality transition
      await req.logEvent(
        'VALIDATION_FAILED',
        'QualityControlTransition',
        allocation_id || 'UNKNOWN',
        `Quality transition validation failed: missing required fields`,
        null,
        { 
          allocation_id: allocation_id,
          to_status: to_status,
          quantity_to_move: quantity_to_move,
          reason: reason,
          missing_fields: {
            allocation_id: !allocation_id,
            to_status: !to_status,
            quantity_to_move: !quantity_to_move,
            reason: !reason
          },
          user_id: userId,
          user_role: userRole
        },
        { operation_type: 'VALIDATION', action_type: 'QUALITY_TRANSITION_VALIDATION' }
      );
      
      return res.status(400).json({
        success: false,
        message: "Missing required fields: allocation_id, to_status, quantity_to_move, reason",
      });
    }

    // Validate transition status
    const validStatuses = ["APROBADO", "DEVOLUCIONES", "CONTRAMUESTRAS", "RECHAZADOS"];
    if (!validStatuses.includes(to_status)) {
      // ✅ LOG: Invalid transition status
      await req.logEvent(
        'VALIDATION_FAILED',
        'QualityControlTransition',
        allocation_id,
        `Invalid quality transition status provided: ${to_status}`,
        null,
        { 
          allocation_id: allocation_id,
          provided_status: to_status,
          valid_statuses: validStatuses,
          user_id: userId,
          user_role: userRole
        },
        { operation_type: 'VALIDATION', action_type: 'QUALITY_STATUS_VALIDATION' }
      );
      
      return res.status(400).json({
        success: false,
        message: `Invalid to_status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // ✅ FIXED: Properly handle numeric fields to avoid NaN
    const parsedQuantity = parseInt(quantity_to_move);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      // ✅ LOG: Invalid quantity for transition
      await req.logEvent(
        'QUANTITY_VALIDATION_FAILED',
        'QualityControlTransition',
        allocation_id,
        `Invalid quantity for quality transition: ${quantity_to_move}`,
        null,
        { 
          allocation_id: allocation_id,
          provided_quantity: quantity_to_move,
          parsed_quantity: parsedQuantity,
          to_status: to_status,
          user_id: userId,
          user_role: userRole
        },
        { operation_type: 'VALIDATION', action_type: 'QUALITY_QUANTITY_VALIDATION' }
      );
      
      return res.status(400).json({
        success: false,
        message: "quantity_to_move must be a positive number",
      });
    }

    // Handle optional numeric fields - only pass if they're valid numbers
    const transitionData = {
      allocation_id,
      to_status,
      quantity_to_move: parsedQuantity,
      reason,
      notes,
      new_cell_id,
      performed_by: req.user.id,
    };

    // Only add optional quantities if they're provided and valid
    if (package_quantity_to_move !== undefined && package_quantity_to_move !== null && package_quantity_to_move !== '') {
      const parsedPackages = parseInt(package_quantity_to_move);
      if (!isNaN(parsedPackages)) {
        transitionData.package_quantity_to_move = parsedPackages;
      }
    }

    if (weight_to_move !== undefined && weight_to_move !== null && weight_to_move !== '') {
      const parsedWeight = parseFloat(weight_to_move);
      if (!isNaN(parsedWeight)) {
        transitionData.weight_to_move = parsedWeight;
      }
    }

    if (volume_to_move !== undefined && volume_to_move !== null && volume_to_move !== '') {
      const parsedVolume = parseFloat(volume_to_move);
      if (!isNaN(parsedVolume)) {
        transitionData.volume_to_move = parsedVolume;
      }
    }

    // ✅ LOG: Quality transition process started
    await req.logEvent(
      'QUALITY_TRANSITION_STARTED',
      'QualityControlTransition',
      allocation_id,
      `Started quality transition for allocation ${allocation_id} from CUARENTENA to ${to_status}`,
      null,
      {
        allocation_id: allocation_id,
        from_status: 'CUARENTENA',
        to_status: to_status,
        quantity_to_move: parsedQuantity,
        package_quantity_to_move: transitionData.package_quantity_to_move,
        weight_to_move: transitionData.weight_to_move,
        volume_to_move: transitionData.volume_to_move,
        reason: reason,
        notes: notes,
        new_cell_id: new_cell_id,
        performed_by: userId,
        performer_role: userRole,
        transition_timestamp: new Date().toISOString(),
        business_impact: to_status === 'APROBADO' ? 'INVENTORY_APPROVED_FOR_DEPARTURE' : 
                        to_status === 'DEVOLUCIONES' ? 'INVENTORY_MARKED_FOR_RETURN' :
                        to_status === 'CONTRAMUESTRAS' ? 'INVENTORY_RESERVED_FOR_SAMPLING' :
                        'INVENTORY_REJECTED'
      },
      { operation_type: 'QUALITY_CONTROL', action_type: 'TRANSITION_START' }
    );

    const result = await inventoryService.transitionQualityStatus(transitionData);

    // ✅ LOG: Successful quality transition
    await req.logEvent(
      'QUALITY_STATUS_CHANGED',
      'QualityControlTransition',
      result.transition.transition_id,
      `Successfully transitioned ${parsedQuantity} units from CUARENTENA to ${to_status}`,
      {
        previous_quality_status: 'CUARENTENA',
        previous_inventory_status: result.transition.previous_inventory_status,
        previous_cell_id: result.transition.previous_cell_id
      },
      {
        transition_id: result.transition.transition_id,
        allocation_id: allocation_id,
        inventory_id: result.transition.inventory_id,
        from_status: 'CUARENTENA',
        to_status: to_status,
        quantity_moved: parsedQuantity,
        package_quantity_moved: result.transition.package_quantity_moved,
        weight_moved: result.transition.weight_moved,
        volume_moved: result.transition.volume_moved,
        reason: reason,
        notes: notes,
        performed_by: userId,
        performer_role: userRole,
        performed_at: result.transition.performed_at,
        new_cell_id: new_cell_id,
        cell_reference: result.cellReference,
        product_details: result.transition.product_details,
        entry_order_details: result.transition.entry_order_details,
        business_impact: to_status === 'APROBADO' ? 'INVENTORY_AVAILABLE_FOR_DEPARTURE' : 
                        to_status === 'DEVOLUCIONES' ? 'INVENTORY_FLAGGED_FOR_RETURN' :
                        to_status === 'CONTRAMUESTRAS' ? 'INVENTORY_RESERVED_FOR_SAMPLING' :
                        'INVENTORY_BLOCKED_REJECTED',
        inventory_status_updated: true,
        allocation_status_updated: true,
        inventory_log_created: true
      },
      { 
        operation_type: 'QUALITY_CONTROL', 
        action_type: 'TRANSITION_SUCCESS',
        business_impact: to_status === 'APROBADO' ? 'INVENTORY_DEPARTURE_ENABLED' : 
                        to_status === 'DEVOLUCIONES' ? 'RETURN_PROCESS_INITIATED' :
                        to_status === 'CONTRAMUESTRAS' ? 'SAMPLING_PROCESS_INITIATED' :
                        'INVENTORY_WORKFLOW_BLOCKED',
        next_steps: to_status === 'APROBADO' ? 'INVENTORY_AVAILABLE_FOR_DEPARTURE_ORDERS' : 
                   to_status === 'DEVOLUCIONES' ? 'COORDINATE_RETURN_WITH_SUPPLIER' :
                   to_status === 'CONTRAMUESTRAS' ? 'RESERVE_FOR_QUALITY_SAMPLING' :
                   'INVESTIGATE_REJECTION_REASON'
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        transition: result.transition,
        cellReference: result.cellReference,
      },
      message: `Successfully transitioned ${parsedQuantity} units from quarantine to ${to_status}`,
    });
  } catch (err) {
    console.error("transitionQualityStatus error:", err);
    
    // ✅ LOG: Quality transition failure
    await req.logError(err, {
      controller: 'inventory',
      action: 'transitionQualityStatus',
      allocation_id: req.body.allocation_id,
      to_status: req.body.to_status,
      quantity_to_move: req.body.quantity_to_move,
      reason: req.body.reason,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'QUALITY_TRANSITION_FAILED'
    });
    
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Get available inventory for departure orders (only approved items) */
async function getAvailableInventoryForDeparture(req, res) {
  try {
    const userRole = req.user?.role;

    // Only warehouse, admin, and customers can view available inventory
    if (!["WAREHOUSE", "ADMIN", "CUSTOMER"].includes(userRole)) {
      return res.status(403).json({ 
        message: "Access denied." 
      });
    }

    const availableInventory = await inventoryService.getAvailableInventoryForDeparture(req.query);
    
    return res.json({
      success: true,
      count: availableInventory.length,
      data: availableInventory.map(item => ({
        ...item,
        cellReference: `${item.cell.row}.${String(item.cell.bay).padStart(2, "0")}.${String(item.cell.position).padStart(2, "0")}`,
        entry_order_no: item.allocation?.entry_order_product?.entry_order?.entry_order_no,
        lot_series: item.allocation?.entry_order_product?.lot_series,
        expiration_date: item.allocation?.entry_order_product?.expiration_date,
      })),
      message: "Available inventory for departure retrieved successfully",
    });
  } catch (err) {
    console.error("Error fetching available inventory for departure:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/** Get audit trail for inventory operations */
async function getInventoryAuditTrail(req, res) {
  try {
    const userRole = req.user?.role;

    // Only admin, warehouse, and pharmacist can view audit trails
    if (userRole !== "WAREHOUSE_INCHARGE" && userRole !== "ADMIN" && userRole !== "PHARMACIST") {
      return res.status(403).json({ 
        success: false,
        message: "Access denied. Only admin, warehouse staff, and pharmacists can view audit trails." 
      });
    }

    // ✅ ENHANCED: Get inventory logs with comprehensive filtering
    const result = await inventoryService.getInventoryAuditTrail(req.query);
    
    return res.json({
      success: true,
      message: "Inventory movement logs retrieved successfully",
      data: result.logs,
      pagination: result.pagination,
      summary: result.summary,
      filters_applied: result.filters_applied,
      available_filters: {
        movement_type: ["ENTRY", "DEPARTURE", "ADJUSTMENT", "TRANSFER"],
        filter_examples: {
          dispatch_only: "?movement_type=DEPARTURE",
          entry_only: "?movement_type=ENTRY", 
          specific_departure_order: "?departure_order_id=uuid",
          specific_entry_order: "?entry_order_id=uuid",
          specific_product: "?product_id=uuid",
          specific_warehouse: "?warehouse_id=uuid",
          specific_cell: "?cell_id=uuid",
          specific_user: "?user_id=uuid",
          date_range: "?date_from=2025-06-01&date_to=2025-06-30",
          pagination: "?limit=20&offset=0"
        }
      }
    });
  } catch (err) {
    console.error("Error fetching inventory audit trail:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
}

/**
 * ✅ NEW: Validate inventory synchronization across the system
 */
async function validateInventorySynchronization(req, res) {
  try {
    const { autoFix = false, warehouseId } = req.query;
    
    // Convert string to boolean
    const shouldAutoFix = autoFix === 'true' || autoFix === true;
    
    console.log(`🔧 Starting inventory synchronization validation (autoFix: ${shouldAutoFix})...`);
    
    const result = await inventoryService.validateInventorySynchronization({
      autoFix: shouldAutoFix,
      warehouseId: warehouseId || null
    });
    
    return res.status(200).json({
      success: true,
      message: result.totalIssues > 0 ? 
        `Found ${result.totalIssues} synchronization issues${shouldAutoFix ? `, applied ${result.autoFixesApplied} fixes` : ''}` :
        "All inventory quantities are properly synchronized",
      data: result,
      recommendations: result.totalIssues > 0 ? [
        result.highSeverity > 0 ? "🚨 HIGH PRIORITY: Manual intervention required for data integrity issues" : null,
        result.mediumSeverity > 0 ? "⚠️ MEDIUM PRIORITY: Check allocation vs inventory discrepancies" : null,
        result.lowSeverity > 0 && !shouldAutoFix ? "💡 TIP: Use autoFix=true to automatically fix minor cell synchronization issues" : null,
        "🔄 Consider running this validation regularly to maintain data integrity"
      ].filter(Boolean) : [
        "✅ System is properly synchronized",
        "🔄 Run this check regularly to maintain data integrity"
      ]
    });
  } catch (error) {
    console.error("❌ Error in validateInventorySynchronization:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// ✅ NEW: Get cells filtered by quality status destination
async function getCellsByQualityStatus(req, res) {
  try {
    const { quality_status, warehouse_id, entry_order_id } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!quality_status) {
      return res.status(400).json({
        success: false,
        message: "Quality status is required"
      });
    }

    // Validate quality status
    const validStatuses = ["CUARENTENA", "APROBADO", "DEVOLUCIONES", "CONTRAMUESTRAS", "RECHAZADOS"];
    if (!validStatuses.includes(quality_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid quality status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    // ✅ NEW: Role-based access control
    let cells;
    let accessInfo = {
      user_role: userRole,
      entry_order_id: entry_order_id,
      filtering_applied: false,
      reason: ""
    };

    if (userRole === "ADMIN") {
      // ✅ ADMIN: Can access all cells regardless of entry order
      cells = await inventoryService.getCellsByQualityStatus(quality_status, warehouse_id);
      accessInfo.reason = "Admin access - all cells available";
    } else if (userRole === "WAREHOUSE_INCHARGE" || userRole === "PHARMACIST") {
      // ✅ WAREHOUSE_INCHARGE/PHARMACIST: Need entry_order_id to determine filtering
      if (!entry_order_id) {
        return res.status(400).json({
          success: false,
          message: "entry_order_id is required for warehouse staff to determine appropriate cell filtering",
          suggestion: "Add ?entry_order_id=<entry_order_id> to see cells based on entry order creator's role"
        });
      }

      // Get entry order to determine creator's role
      const entryOrderInfo = await inventoryService.getEntryOrderCreatorInfo(entry_order_id);
      
      if (entryOrderInfo.creator_role === "CLIENT") {
        // ✅ CLIENT entry order: Show only client-assigned cells
        cells = await inventoryService.getCellsByQualityStatusForClient(quality_status, warehouse_id, entryOrderInfo.creator_id);
        accessInfo.filtering_applied = true;
        accessInfo.reason = `Entry order created by CLIENT - showing only client-assigned cells`;
        accessInfo.entry_order_creator_role = "CLIENT";
      } else {
        // ✅ WAREHOUSE_INCHARGE/PHARMACIST entry order: Show all cells
        cells = await inventoryService.getCellsByQualityStatus(quality_status, warehouse_id);
        accessInfo.reason = `Entry order created by ${entryOrderInfo.creator_role} - showing all cells`;
        accessInfo.entry_order_creator_role = entryOrderInfo.creator_role;
      }
    } else if (userRole === "CLIENT") {
      // ✅ CLIENT: Can only see their assigned cells
      cells = await inventoryService.getCellsByQualityStatusForClient(quality_status, warehouse_id, userId);
      accessInfo.filtering_applied = true;
      accessInfo.reason = "Client access - showing only assigned cells";
    } else {
      return res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions to view cells by quality status."
      });
    }

    // ✅ LOG: Cell access for quality status
    await req.logEvent(
      'CELLS_BY_QUALITY_STATUS_ACCESSED',
      'QualityControl',
      `${quality_status}-${warehouse_id || 'all'}`,
      `User accessed cells for quality status ${quality_status}`,
      null,
      {
        quality_status: quality_status,
        warehouse_id: warehouse_id,
        entry_order_id: entry_order_id,
        accessed_by: userId,
        accessor_role: userRole,
        cells_returned: cells.length,
        filtering_applied: accessInfo.filtering_applied,
        access_reason: accessInfo.reason,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'QUALITY_CONTROL', action_type: 'CELL_ACCESS' }
    );
    
    res.json({
      success: true,
      data: {
        quality_status,
        warehouse_id: warehouse_id || "all",
        cells_count: cells.length,
        cells,
        access_info: accessInfo
      }
    });
  } catch (error) {
    console.error("❌ Error getting cells by quality status:", error);
    
    // ✅ LOG: Cell access failure
    await req.logError(error, {
      controller: 'inventory',
      action: 'getCellsByQualityStatus',
      quality_status: req.query.quality_status,
      warehouse_id: req.query.warehouse_id,
      entry_order_id: req.query.entry_order_id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CELL_ACCESS_FAILED'
    });
    
    res.status(500).json({
      success: false,
      message: "Failed to get cells by quality status",
      error: error.message
    });
  }
}

// ✅ NEW: Get comprehensive allocation helper information for an entry order
async function getEntryOrderAllocationHelper(req, res) {
  try {
    const { entryOrderId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!entryOrderId) {
      return res.status(400).json({
        success: false,
        message: "Entry order ID is required"
      });
    }

    // ✅ LOG: Allocation helper access
    await req.logEvent(
      'ALLOCATION_HELPER_ACCESSED',
      'EntryOrder',
      entryOrderId,
      `User accessed allocation helper for entry order ${entryOrderId}`,
      null,
      {
        entry_order_id: entryOrderId,
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'INVENTORY_ALLOCATION', action_type: 'HELPER_ACCESS' }
    );

    const allocationHelper = await inventoryService.getEntryOrderAllocationHelper(entryOrderId, userRole, userId);

    res.status(200).json({
      success: true,
      message: "Allocation helper data fetched successfully",
      data: allocationHelper
    });
  } catch (error) {
    console.error("Error in getEntryOrderAllocationHelper controller:", error);
    
    // ✅ LOG: Allocation helper access failure
    await req.logError(error, {
      controller: 'inventory',
      action: 'getEntryOrderAllocationHelper',
      entry_order_id: req.params.entryOrderId,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'ALLOCATION_HELPER_ACCESS_FAILED'
    });

    res.status(500).json({
      success: false,
      message: "Error fetching allocation helper data",
      error: error.message,
    });
  }
}

// ✅ NEW: Bulk assign all products in an entry order in one operation
async function bulkAssignEntryOrder(req, res) {
  try {
    const bulkAssignmentData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Validate required fields
    if (!bulkAssignmentData.entry_order_id) {
      return res.status(400).json({
        success: false,
        message: "Entry order ID is required"
      });
    }

    if (!bulkAssignmentData.allocations || !Array.isArray(bulkAssignmentData.allocations) || bulkAssignmentData.allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Allocations array is required and must contain at least one allocation"
      });
    }

    // ✅ LOG: Bulk assignment process started
    await req.logEvent(
      'BULK_ASSIGNMENT_STARTED',
      'EntryOrder',
      bulkAssignmentData.entry_order_id,
      `Started bulk assignment for entry order ${bulkAssignmentData.entry_order_id} with ${bulkAssignmentData.allocations.length} allocations`,
      null,
      {
        entry_order_id: bulkAssignmentData.entry_order_id,
        allocations_count: bulkAssignmentData.allocations.length,
        assigned_by: userId,
        assigner_role: userRole,
        assignment_timestamp: new Date().toISOString(),
        total_products: bulkAssignmentData.allocations.map(a => a.entry_order_product_id).filter((v, i, arr) => arr.indexOf(v) === i).length,
        force_complete_allocation: bulkAssignmentData.force_complete_allocation || false,
        warehouse_ids: [...new Set(bulkAssignmentData.allocations.map(a => a.warehouse_id))],
        cell_ids: [...new Set(bulkAssignmentData.allocations.map(a => a.cell_id))]
      },
      { operation_type: 'INVENTORY_ALLOCATION', action_type: 'BULK_ASSIGNMENT_START' }
    );

    // Add assigned_by to the request data
    bulkAssignmentData.assigned_by = userId;

    const result = await inventoryService.bulkAssignEntryOrder(bulkAssignmentData);

    // ✅ LOG: Successful bulk assignment
    await req.logEvent(
      'BULK_ASSIGNMENT_COMPLETED',
      'EntryOrder',
      bulkAssignmentData.entry_order_id,
      `Successfully completed bulk assignment for entry order ${bulkAssignmentData.entry_order_id}`,
      null,
      {
        entry_order_id: bulkAssignmentData.entry_order_id,
        entry_order_no: result.entry_order_no,
        allocations_created: result.allocations.length,
        inventory_records_created: result.inventory_records.length,
        cells_occupied: result.cells_occupied.length,
        assigned_by: userId,
        assigner_role: userRole,
        completed_at: new Date().toISOString(),
        is_fully_allocated: result.is_fully_allocated,
        allocation_percentage: result.allocation_percentage,
        total_quantity_allocated: result.summary.total_quantity_allocated,
        total_packages_allocated: result.summary.total_packages_allocated,
        total_weight_allocated: result.summary.total_weight_allocated,
        warehouses_used: result.warehouses_used,
        business_impact: result.is_fully_allocated ? 'ENTRY_ORDER_FULLY_ALLOCATED' : 'ENTRY_ORDER_PARTIALLY_ALLOCATED'
      },
      { 
        operation_type: 'INVENTORY_ALLOCATION', 
        action_type: 'BULK_ASSIGNMENT_SUCCESS',
        business_impact: result.is_fully_allocated ? 'INVENTORY_READY_FOR_QUALITY_CONTROL' : 'PARTIAL_ALLOCATION_REQUIRES_REVIEW',
        next_steps: result.is_fully_allocated ? 'QUALITY_CONTROL_CAN_BEGIN' : 'COMPLETE_REMAINING_ALLOCATIONS'
      }
    );

    res.status(201).json({
      success: true,
      message: result.is_fully_allocated 
        ? "Entry order fully allocated successfully" 
        : "Entry order partially allocated successfully",
      data: result
    });
  } catch (error) {
    console.error("Error in bulkAssignEntryOrder controller:", error);
    
    // ✅ LOG: Bulk assignment failure
    await req.logError(error, {
      controller: 'inventory',
      action: 'bulkAssignEntryOrder',
      entry_order_id: req.body.entry_order_id,
      allocations_count: req.body.allocations?.length || 0,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'BULK_ASSIGNMENT_FAILED'
    });

    // ✅ Enhanced error handling for validation failures
    if (error.message.includes('validation') || error.message.includes('exceed') || error.message.includes('not found')) {
      res.status(400).json({
        success: false,
        message: error.message,
        error_type: 'VALIDATION_ERROR'
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Error processing bulk assignment",
        error: error.message,
      });
    }
  }
}

module.exports = {
  getApprovedEntryOrdersForInventory,
  getEntryOrderProductsForInventory,
  assignProductToCell,
  getAvailableCellsForWarehouse,
  getInventorySummary,
  fetchWarehouses,
  fetchCells,
  getQuarantineInventory,
  getInventoryByQualityStatus,
  transitionQualityStatus,
  getAvailableInventoryForDeparture,
  getInventoryAuditTrail,
  validateInventorySynchronization,
  getCellsByQualityStatus,
  getEntryOrderAllocationHelper,
  bulkAssignEntryOrder,
};