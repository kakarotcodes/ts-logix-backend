const supplierService = require('./supplier.service');

/**
 * Create a new supplier
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function createSupplier(req, res) {
  try {
    const supplierData = req.body;
    
    // ✅ NEW: Validate required company_name field
    if (!supplierData.company_name) {
      return res.status(400).json({
        success: false,
        message: "Company name is required"
      });
    }
    
    // ✅ DEPRECATED: Keep backward compatibility check for old 'name' field
    if (!supplierData.name && !supplierData.company_name) {
      return res.status(400).json({
        success: false,
        message: "Supplier name or company name is required"
      });
    }
    
    // ✅ NEW: Pass user context for automatic client assignment
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    const newSupplier = await supplierService.createSupplier(supplierData, userRole, userId);
    
    return res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      data: newSupplier
    });
  } catch (error) {
    console.error("Error in createSupplier controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create supplier",
      error: error.message
    });
  }
}

/**
 * Get all suppliers
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function getAllSuppliers(req, res) {
  try {
    const search = req.query.search;
    
    // ✅ FIXED: Extract user context for client-based filtering
    // The JWT token stores role directly as a string, not as an object
    const userRole = req.user?.role; // Direct access to role string
    const userId = req.user?.id;
    
    console.log(`🔍 Supplier request from user:`, {
      user_id: userId,
      role: userRole,
      search: search || 'none'
    });
    
    const suppliers = await supplierService.getAllSuppliers(search, userRole, userId);

    return res.status(200).json({
      success: true,
      message: "Suppliers retrieved successfully",
      data: suppliers,
      count: suppliers.length,
      // ✅ NEW: Include filtering context in response
      meta: {
        filtered_by_role: userRole,
        user_id: userId,
        search_applied: !!search
      }
    });
  } catch (error) {
    console.error("Error in getAllSuppliers controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve suppliers",
      error: error.message,
    });
  }
}

/**
 * Get supplier by ID
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function getSupplierById(req, res) {
  try {
    const { id } = req.params;
    
    const supplier = await supplierService.getSupplierById(id);
    
    return res.status(200).json({
      success: true,
      message: "Supplier retrieved successfully",
      data: supplier
    });
  } catch (error) {
    console.error("Error in getSupplierById controller:", error);
    
    if (error.message === "Supplier not found") {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve supplier",
      error: error.message
    });
  }
}

/**
 * Update supplier
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function updateSupplier(req, res) {
  try {
    const { id } = req.params;
    const supplierData = req.body;
    
    // ✅ NEW: Validate company_name if provided (not required for updates)
    // ✅ DEPRECATED: Keep backward compatibility check for old 'name' field
    if (!supplierData.company_name && !supplierData.name) {
      return res.status(400).json({
        success: false,
        message: "Company name or supplier name is required"
      });
    }
    
    // ✅ NEW: Pass user context for permission checking
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    const updatedSupplier = await supplierService.updateSupplier(id, supplierData, userRole, userId);
    
    return res.status(200).json({
      success: true,
      message: "Supplier updated successfully",
      data: updatedSupplier
    });
  } catch (error) {
    console.error("Error in updateSupplier controller:", error);
    
    if (error.message.includes("Record to update not found")) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
        error: error.message
      });
    }
    
    if (error.message.includes("Insufficient permissions")) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to edit this supplier",
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to update supplier",
      error: error.message
    });
  }
}

/**
 * Delete supplier
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function deleteSupplier(req, res) {
  try {
    const { id } = req.params;
    
    const deletedSupplier = await supplierService.deleteSupplier(id);
    
    return res.status(200).json({
      success: true,
      message: "Supplier deleted successfully",
      data: deletedSupplier
    });
  } catch (error) {
    console.error("Error in deleteSupplier controller:", error);
    
    if (error.message.includes("Record to delete does not exist")) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
        error: error.message
      });
    }
    
    if (error.message.includes("Cannot delete supplier with related entry order products")) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete supplier with related entry order products",
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to delete supplier",
      error: error.message
    });
  }
}

/**
 * Get form fields: countries and supplier categories
 */
async function getFormFields(req, res) {
  try {
    const formFields = await supplierService.getFormFields();
    res.json(formFields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ✅ NEW: Get supplier categories
async function getSupplierCategories(req, res) {
  try {
    const categories = await supplierService.getSupplierCategories();
    
    return res.status(200).json({
      success: true,
      message: "Supplier categories retrieved successfully",
      data: categories
    });
  } catch (error) {
    console.error("Error in getSupplierCategories controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve supplier categories",
      error: error.message
    });
  }
}

// ✅ NEW: Get next supplier code
async function getNextSupplierCode(req, res) {
  try {
    const codeInfo = await supplierService.getNextSupplierCode();
    
    return res.status(200).json({
      success: true,
      message: "Next supplier code generated successfully",
      data: codeInfo
    });
  } catch (error) {
    console.error("Error in getNextSupplierCode controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate next supplier code",
      error: error.message
    });
  }
}

// ✅ NEW: Create client-supplier assignments
async function createClientSupplierAssignments(req, res) {
  try {
    const { client_id, supplier_ids, assignment_settings } = req.body;
    const assigned_by = req.user?.id;
    
    if (!client_id || !supplier_ids || !Array.isArray(supplier_ids) || supplier_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Client ID and supplier IDs array are required"
      });
    }
    
    if (!assigned_by) {
      return res.status(401).json({
        success: false,
        message: "User authentication required"
      });
    }
    
    const assignments = await supplierService.createClientSupplierAssignments({
      client_id,
      supplier_ids,
      assigned_by,
      assignment_settings
    });
    
    return res.status(201).json({
      success: true,
      message: `Successfully assigned ${assignments.length} suppliers to client`,
      data: assignments,
      count: assignments.length
    });
  } catch (error) {
    console.error("Error in createClientSupplierAssignments controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create client-supplier assignments",
      error: error.message
    });
  }
}

// ✅ NEW: Get client-supplier assignments
async function getClientSupplierAssignments(req, res) {
  try {
    const { client_id } = req.params;
    
    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required"
      });
    }
    
    const assignments = await supplierService.getClientSupplierAssignments(client_id);
    
    return res.status(200).json({
      success: true,
      message: "Client supplier assignments retrieved successfully",
      data: assignments,
      count: assignments.length
    });
  } catch (error) {
    console.error("Error in getClientSupplierAssignments controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve client supplier assignments",
      error: error.message
    });
  }
}

// ✅ NEW: Remove client-supplier assignment
async function removeClientSupplierAssignment(req, res) {
  try {
    const { assignment_id } = req.params;
    const removed_by = req.user?.id;
    
    if (!assignment_id) {
      return res.status(400).json({
        success: false,
        message: "Assignment ID is required"
      });
    }
    
    if (!removed_by) {
      return res.status(401).json({
        success: false,
        message: "User authentication required"
      });
    }
    
    const assignment = await supplierService.removeClientSupplierAssignment(assignment_id, removed_by);
    
    return res.status(200).json({
      success: true,
      message: "Client supplier assignment removed successfully",
      data: assignment
    });
  } catch (error) {
    console.error("Error in removeClientSupplierAssignment controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove client supplier assignment",
      error: error.message
    });
  }
}

// ✅ NEW: Get available suppliers for client assignment
async function getAvailableSuppliersForClient(req, res) {
  try {
    const { client_id } = req.params;
    
    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required"
      });
    }
    
    const availableSuppliers = await supplierService.getAvailableSuppliersForClient(client_id);
    
    return res.status(200).json({
      success: true,
      message: "Available suppliers for client retrieved successfully",
      data: availableSuppliers,
      count: availableSuppliers.length
    });
  } catch (error) {
    console.error("Error in getAvailableSuppliersForClient controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve available suppliers for client",
      error: error.message
    });
  }
}

// ✅ NEW: Get client by ID with all details
async function getClientById(req, res) {
  try {
    const { client_id } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required"
      });
    }
    
    const client = await supplierService.getClientById(client_id, userRole, userId);
    
    return res.status(200).json({
      success: true,
      message: "Client information retrieved successfully",
      data: client,
      meta: {
        user_role: userRole,
        user_id: userId,
        entry_orders_count: client.entryOrders?.length || 0,
        departure_orders_count: client.departureOrders?.length || 0,
        supplier_assignments_count: client.supplierAssignments?.length || 0,
        product_assignments_count: client.productAssignments?.length || 0,
        cell_assignments_count: client.cellAssignments?.length || 0
      }
    });
  } catch (error) {
    console.error("Error in getClientById controller:", error);
    
    if (error.message.includes("Client not found")) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
        error: error.message
      });
    }
    
    if (error.message.includes("You can only access")) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to access this client's information",
        error: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve client information",
      error: error.message
    });
  }
}

module.exports = {
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  getFormFields,
  
  // ✅ NEW: Category system controller
  getSupplierCategories,
  
  // ✅ NEW: Supplier code generation
  getNextSupplierCode,
  
  // ✅ NEW: Client-supplier assignment management
  createClientSupplierAssignments,
  getClientSupplierAssignments,
  removeClientSupplierAssignment,
  getAvailableSuppliersForClient,
  
  // ✅ NEW: Client information
  getClientById,
};