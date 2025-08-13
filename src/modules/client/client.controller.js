const clientService = require("./client.service");

// Create a new client with REQUIRED cell assignment
async function createClient(req, res) {
  try {
    const clientData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Validate ALL required fields
    const validationErrors = [];

    // Client type validation
    if (!clientData.client_type) {
      validationErrors.push("Client type is required");
    } else if (!["JURIDICO", "NATURAL"].includes(clientData.client_type)) {
      validationErrors.push("Client type must be JURIDICO or NATURAL");
    }

    // Common required fields
    if (!clientData.email) validationErrors.push("Email is required");
    if (!clientData.address) validationErrors.push("Address is required");
    if (!clientData.phone) validationErrors.push("Phone number is required");
    if (!clientData.cell_phone) validationErrors.push("Cell phone number is required");

    // Client type specific validation
    if (clientData.client_type === "JURIDICO") {
      if (!clientData.company_name) validationErrors.push("Company name is required for juridical clients");
      if (!clientData.ruc) validationErrors.push("RUC is required for juridical clients");
      if (!clientData.company_type) validationErrors.push("Company type is required for juridical clients");
      if (!clientData.establishment_type) validationErrors.push("Establishment type is required for juridical clients");
    } else if (clientData.client_type === "NATURAL") {
      if (!clientData.first_names) validationErrors.push("First names are required for natural clients");
      if (!clientData.last_name) validationErrors.push("Last name is required for natural clients");
      if (!clientData.mothers_last_name) validationErrors.push("Mother's last name is required for natural clients");
      if (!clientData.individual_id) validationErrors.push("Individual ID is required for natural clients");
      if (!clientData.date_of_birth) validationErrors.push("Date of birth is required for natural clients");
    }

    // Cell assignment validation (mandatory)
    if (!clientData.cell_ids || !Array.isArray(clientData.cell_ids) || clientData.cell_ids.length === 0) {
      validationErrors.push("Cell assignment is required. Please provide at least one cell_id in the cell_ids array");
    }
    if (!clientData.warehouse_id) {
      validationErrors.push("Warehouse ID is required for cell assignment");
    }

    // Return all validation errors at once
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }
    
    // Extract cell assignment data (now required)
    const cellAssignmentData = {
      cell_ids: clientData.cell_ids,
      warehouse_id: clientData.warehouse_id,
      assigned_by: req.user?.id || clientData.assigned_by,
      notes: clientData.assignment_notes,
      max_capacity: clientData.max_capacity
    };
    
    // Validate assigned_by user
    if (!cellAssignmentData.assigned_by) {
      return res.status(400).json({
        success: false,
        message: "Assigned by user ID is required for cell assignment.",
      });
    }
    
    // Remove cell assignment fields from client data
    const {
      cell_ids,
      warehouse_id,
      assigned_by,
      assignment_notes,
      max_capacity,
      ...pureClientData
    } = clientData;
    
    // ✅ OPTIMIZATION: Skip redundant logging in controller since service will log the creation
    
    const newClient = await clientService.createClient(pureClientData, cellAssignmentData);
    
    // ✅ OPTIMIZATION: Single success log (service already logs detailed creation)
    res.status(201).json({
      success: true,
      message: "Client created and cells assigned successfully",
      data: newClient,
    });
  } catch (error) {
    console.error("Error in createClient controller:", error);
    
    // ✅ OPTIMIZATION: Simplified error logging
    await req.logError(error, {
      controller: 'client',
      action: 'createClient',
      client_type: req.body.client_type,
      cell_count: req.body.cell_ids?.length || 0,
      user_id: req.user?.id,
      error_context: 'CLIENT_CREATION_FAILED'
    });
    
    res.status(500).json({
      success: false,
      message: "Error creating client",
      error: error.message,
    });
  }
}

// Get all clients with filtering (no pagination - handled by frontend)
async function getAllClients(req, res) {
  try {
    const filters = {
      client_type: req.query.client_type,
      company_type: req.query.company_type,
      establishment_type: req.query.establishment_type,
      active_state_id: req.query.active_state_id,
      search: req.query.search
    };

    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Client list access
    await req.logEvent(
      'CLIENT_LIST_ACCESSED',
      'Client',
      'CLIENT_LIST',
      `User accessed client list`,
      null,
      {
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString(),
        query_params: req.query
      },
      { operation_type: 'CLIENT_MANAGEMENT', action_type: 'LIST_ACCESS' }
    );

    const clients = await clientService.getAllClients(filters);
    
    res.status(200).json({
      success: true,
      message: "Clients fetched successfully",
      data: clients,
      total_count: clients.length
    });
  } catch (error) {
    console.error("Error in getAllClients controller:", error);
    
    // ✅ LOG: Client list access failure
    await req.logError(error, {
      controller: 'client',
      action: 'getAllClients',
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CLIENT_LIST_ACCESS_FAILED'
    });
    
    res.status(500).json({
      success: false,
      message: "Error fetching clients",
      error: error.message,
    });
  }
}

// Get client by ID
async function getClientById(req, res) {
  try {
    const { client_id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Client details access
    await req.logEvent(
      'CLIENT_DETAILS_ACCESSED',
      'Client',
      client_id,
      `User accessed client details for client ${client_id}`,
      null,
      {
        client_id: client_id,
        accessed_by: userId,
        accessor_role: userRole,
        access_timestamp: new Date().toISOString()
      },
      { operation_type: 'CLIENT_MANAGEMENT', action_type: 'DETAILS_ACCESS' }
    );

    const client = await clientService.getClientById(client_id);
    
    if (!client) {
      // ✅ LOG: Client not found
      await req.logEvent(
        'CLIENT_NOT_FOUND',
        'Client',
        client_id,
        `Client ${client_id} not found during details access`,
        null,
        {
          client_id: client_id,
          accessed_by: userId,
          accessor_role: userRole
        },
        { operation_type: 'CLIENT_MANAGEMENT', action_type: 'NOT_FOUND' }
      );
      
      return res.status(404).json({
        success: false,
        message: "Client not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Client fetched successfully",
      data: client,
    });
  } catch (error) {
    console.error("Error in getClientById controller:", error);
    
    // ✅ LOG: Client details access failure
    await req.logError(error, {
      controller: 'client',
      action: 'getClientById',
      client_id: req.params.client_id,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CLIENT_DETAILS_ACCESS_FAILED'
    });
    
    const statusCode = error.message === "Client not found" ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: "Error fetching client",
      error: error.message,
    });
  }
}

// Update client
async function updateClient(req, res) {
  try {
    const { client_id } = req.params;
    const updateData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // ✅ LOG: Client update process started
    await req.logEvent(
      'CLIENT_UPDATE_STARTED',
      'Client',
      client_id,
      `Started updating client ${client_id}`,
      null,
      {
        client_id: client_id,
        update_fields: Object.keys(updateData),
        updated_by: userId,
        updater_role: userRole,
        update_timestamp: new Date().toISOString(),
        has_name_change: !!updateData.name,
        has_contact_change: !!(updateData.email || updateData.phone),
        has_address_change: !!(updateData.address || updateData.city || updateData.country),
        has_status_change: !!updateData.status
      },
      { operation_type: 'CLIENT_MANAGEMENT', action_type: 'UPDATE_START' }
    );
    
    const updatedClient = await clientService.updateClient(client_id, updateData);
    
    if (!updatedClient.success) {
      // ✅ LOG: Client update failure (not found)
      await req.logEvent(
        'CLIENT_UPDATE_FAILED',
        'Client',
        client_id,
        `Client ${client_id} not found during update attempt`,
        null,
        {
          client_id: client_id,
          update_fields: Object.keys(updateData),
          updated_by: userId,
          updater_role: userRole,
          failure_reason: 'CLIENT_NOT_FOUND'
        },
        { operation_type: 'CLIENT_MANAGEMENT', action_type: 'UPDATE_NOT_FOUND' }
      );
      
      return res.status(404).json(updatedClient);
    }

    // ✅ LOG: Successful client update
    await req.logEvent(
      'CLIENT_UPDATED',
      'Client',
      client_id,
      `Successfully updated client ${client_id}`,
      updatedClient.oldValues,
      updatedClient.newValues,
      { 
        operation_type: 'CLIENT_MANAGEMENT', 
        action_type: 'UPDATE_SUCCESS',
        business_impact: updateData.status ? 'CLIENT_STATUS_CHANGED' : 'CLIENT_INFORMATION_UPDATED',
        changes_summary: {
          fields_updated: Object.keys(updateData),
          status_changed: !!updateData.status,
          contact_info_changed: !!(updateData.email || updateData.phone),
          address_changed: !!(updateData.address || updateData.city || updateData.country)
        }
      }
    );
    
    res.status(200).json(updatedClient);
  } catch (error) {
    console.error("Error in updateClient controller:", error);
    
    // ✅ LOG: Client update failure
    await req.logError(error, {
      controller: 'client',
      action: 'updateClient',
      client_id: req.params.client_id,
      update_data_keys: Object.keys(req.body || {}),
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CLIENT_UPDATE_FAILED'
    });
    
    const statusCode = error.message === "Client not found" ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message: "Error updating client",
      error: error.message,
    });
  }
}

// Assign cells to client
async function assignCellsToClient(req, res) {
  try {
    const assignmentData = {
      ...req.body,
      assigned_by: req.user?.id || req.body.assigned_by, // Get from auth middleware or request body
    };

    const assignments = await clientService.assignCellsToClient(assignmentData);
    
    res.status(201).json({
      success: true,
      message: "Cells assigned to client successfully",
      data: assignments,
    });
  } catch (error) {
    console.error("Error in assignCellsToClient controller:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// Get client cell assignments
async function getClientCellAssignments(req, res) {
  try {
    const { client_id } = req.params;
    const assignments = await clientService.getClientCellAssignments(client_id);
    
    res.status(200).json({
      success: true,
      message: "Client cell assignments fetched successfully",
      data: assignments,
    });
  } catch (error) {
    console.error("Error in getClientCellAssignments controller:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// Get available cells for client assignment
async function getAvailableCellsForClient(req, res) {
  try {
    const { warehouse_id } = req.query;
    const cells = await clientService.getAvailableCellsForClient(warehouse_id);
    
    res.status(200).json({
      success: true,
      message: "Available cells fetched successfully",
      data: cells,
    });
  } catch (error) {
    console.error("Error in getAvailableCellsForClient controller:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// ✅ NEW: Get available cells including cells assigned to specific client
async function getAvailableCellsWithClientAssignments(req, res) {
  try {
    const { warehouse_id, client_id } = req.query;
    
    // Validate required client_id parameter
    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required as a query parameter",
        usage: "GET /client/cells/available-with-assignments?client_id=CLIENT_ID&warehouse_id=WAREHOUSE_ID"
      });
    }
    
    const result = await clientService.getAvailableCellsWithClientAssignments(warehouse_id, client_id);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getAvailableCellsWithClientAssignments controller:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available cells with client assignments",
      error: error.message,
    });
  }
}

// Deactivate client cell assignment
async function deactivateClientCellAssignment(req, res) {
  try {
    const { assignment_id } = req.params;
    const deactivated_by = req.user?.id || req.body.deactivated_by;
    
    const assignment = await clientService.deactivateClientCellAssignment(assignment_id, deactivated_by);
    
    res.status(200).json({
      success: true,
      message: "Client cell assignment deactivated successfully",
      data: assignment,
    });
  } catch (error) {
    console.error("Error in deactivateClientCellAssignment controller:", error);
    res.status(400).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// Get form fields for client creation
async function getClientFormFields(req, res) {
  try {
    const formFields = await clientService.getClientFormFields();
    
    res.status(200).json({
      success: true,
      message: "Client form fields fetched successfully",
      data: formFields,
    });
  } catch (error) {
    console.error("Error in getClientFormFields controller:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

// Get client statistics
async function getClientStatistics(req, res) {
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();

    const [
      totalClients,
      juridicalClients,
      naturalClients,
      activeClients,
      clientsWithCells,
      recentClients
    ] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { client_type: "JURIDICO" } }),
      prisma.client.count({ where: { client_type: "NATURAL" } }),
      prisma.client.count({ 
        where: { 
          active_state: { name: "Activo" }
        }
      }),
      prisma.client.count({
        where: {
          cellAssignments: {
            some: {
              is_active: true
            }
          }
        }
      }),
      prisma.client.count({
        where: {
          created_at: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      })
    ]);

    const statistics = {
      totalClients,
      juridicalClients,
      naturalClients,
      activeClients,
      clientsWithCells,
      recentClients,
      percentages: {
        juridical: totalClients > 0 ? ((juridicalClients / totalClients) * 100).toFixed(1) : 0,
        natural: totalClients > 0 ? ((naturalClients / totalClients) * 100).toFixed(1) : 0,
        active: totalClients > 0 ? ((activeClients / totalClients) * 100).toFixed(1) : 0,
        withCells: totalClients > 0 ? ((clientsWithCells / totalClients) * 100).toFixed(1) : 0
      }
    };

    res.status(200).json({
      success: true,
      message: "Client statistics fetched successfully",
      data: statistics,
    });
  } catch (error) {
    console.error("Error in getClientStatistics controller:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}

/**
 * ✅ DEBUG: Get client credentials (for testing purposes only)
 */
async function getClientCredentials(req, res) {
  try {
    // Only allow warehouse incharge and admin to access this
    if (!["WAREHOUSE_INCHARGE", "ADMIN"].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only warehouse incharge and admin can access client credentials.",
      });
    }

    const clients = await clientService.getClientCredentials();
    
    return res.status(200).json({
      success: true,
      message: "Client credentials retrieved successfully",
      count: clients.length,
      data: clients,
      warning: "⚠️ This endpoint is for testing purposes only. Do not expose credentials in production.",
    });
  } catch (error) {
    console.error("Error getting client credentials:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving client credentials",
      error: error.message,
    });
  }
}

/**
 * ✅ TEST: Create a simple test client with minimal requirements
 */
async function createTestClient(req, res) {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    // Only allow warehouse incharge and admin to create test clients
    if (!["WAREHOUSE_INCHARGE", "ADMIN"].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only warehouse incharge and admin can create test clients.",
      });
    }

    // Get available warehouses and cells for assignment
    const warehouses = await clientService.getAvailableWarehousesForAssignment();
    if (warehouses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No warehouses available for client assignment.",
      });
    }

    // Get available cells from the first warehouse
    const firstWarehouse = warehouses[0];
    const availableCells = await clientService.getAvailableCellsForClient(firstWarehouse.warehouse_id);
    
    if (!availableCells.all_cells || availableCells.all_cells.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No available cells for client assignment.",
      });
    }

    // Create a simple test client
    const testClientData = {
      client_type: "JURIDICO",
      company_name: `Test Client ${Date.now()}`,
              company_type: "PRIVADO",
      establishment_type: "FARMACIA",
      email: `testclient${Date.now()}@test.com`,
      address: "123 Test Street, Test City",
      phone: "123-456-7890",
      cell_phone: "098-765-4321",
      ruc: `20${Math.random().toString().slice(2, 11)}`,
    };

    // Use first 2 available cells for assignment
    const cellAssignmentData = {
      cell_ids: availableCells.all_cells.slice(0, 2).map(cell => cell.id),
      warehouse_id: firstWarehouse.warehouse_id,
      assigned_by: userId,
      notes: "Test client created by system",
      max_capacity: 100.00
    };

    const newClient = await clientService.createClient(testClientData, cellAssignmentData);
    
    return res.status(201).json({
      success: true,
      message: "Test client created successfully",
      data: newClient,
      warehouse_assigned: firstWarehouse.name,
      cells_assigned: cellAssignmentData.cell_ids.length,
    });
  } catch (error) {
    console.error("Error creating test client:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating test client",
      error: error.message,
    });
  }
}

/**
 * ✅ NEW: Get pending credentials for handover to clients
 */
async function getPendingCredentials(req, res) {
  try {
    // Only allow warehouse incharge and admin to access credentials
    if (!["WAREHOUSE_INCHARGE", "ADMIN"].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only warehouse incharge and admin can access client credentials.",
      });
    }

    const pendingCredentials = await clientService.getPendingCredentialsForHandover();
    
    return res.status(200).json({
      success: true,
      message: "Pending credentials retrieved successfully",
      count: pendingCredentials.length,
      data: pendingCredentials,
      note: "⚠️ These credentials should be securely handed over to clients. They will auto-expire after 24 hours.",
    });
  } catch (error) {
    console.error("Error getting pending credentials:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving pending credentials",
      error: error.message,
    });
  }
}

/**
 * ✅ NEW: Get specific client credentials for handover
 */
async function getClientCredentialsById(req, res) {
  try {
    const { client_id } = req.params;
    
    // Only allow warehouse incharge and admin to access credentials
    if (!["WAREHOUSE_INCHARGE", "ADMIN"].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only warehouse incharge and admin can access client credentials.",
      });
    }

    const credentials = await clientService.getClientCredentialsForHandover(client_id);
    
    return res.status(200).json({
      success: true,
      message: "Client credentials retrieved successfully",
      data: credentials,
      note: "⚠️ Please hand over these credentials securely to the client and mark as completed.",
    });
  } catch (error) {
    console.error("Error getting client credentials:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving client credentials",
      error: error.message,
    });
  }
}

/**
 * ✅ NEW: Mark credentials as handed over to client
 */
async function markCredentialsHandedOver(req, res) {
  try {
    const { client_id } = req.params;
    
    // Only allow warehouse incharge and admin to mark credentials as handed over
    if (!["WAREHOUSE_INCHARGE", "ADMIN"].includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only warehouse incharge and admin can mark credentials as handed over.",
      });
    }

    const result = await clientService.markCredentialsHandedOver(client_id);
    
    return res.status(200).json({
      success: true,
      message: "Credentials marked as handed over successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error marking credentials as handed over:", error);
    return res.status(500).json({
      success: false,
      message: "Error marking credentials as handed over",
      error: error.message,
    });
  }
}

/**
 * ✅ ENHANCED: Update client with cell reassignment capabilities
 */
async function updateClientWithCellReassignment(req, res) {
  try {
    const { client_id } = req.params;
    const updateData = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Validate required parameters
    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required"
      });
    }

    // Log the update attempt
    await req.logEvent(
      'CLIENT_UPDATE_WITH_REASSIGNMENT_STARTED',
      'Client',
      client_id,
      `Started comprehensive client update with possible cell reassignment for client ${client_id}`,
      null,
      {
        client_id: client_id,
        update_fields: Object.keys(updateData),
        has_cell_reassignment: !!updateData.reassign_cells,
        new_cells: updateData.cell_ids || [],
        updated_by: userId,
        updater_role: userRole,
        update_timestamp: new Date().toISOString()
      },
      { operation_type: 'CLIENT_MANAGEMENT', action_type: 'COMPREHENSIVE_UPDATE_START' }
    );

    const result = await clientService.updateClientWithCellReassignment(
      client_id,
      updateData,
      userId
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log successful update
    await req.logEvent(
      'CLIENT_UPDATE_WITH_REASSIGNMENT_COMPLETED',
      'Client',
      client_id,
      `Successfully completed comprehensive client update for client ${client_id}`,
      null,
      {
        client_id: client_id,
        changes: result.changes,
        client_updated: result.changes?.client_updated || false,
        cells_reassigned: result.changes?.cells_reassigned || false,
        old_cell_count: result.changes?.old_cell_count || 0,
        new_cell_count: result.changes?.new_cell_count || 0,
        updated_by: userId,
        updater_role: userRole
      },
      { 
        operation_type: 'CLIENT_MANAGEMENT', 
        action_type: 'COMPREHENSIVE_UPDATE_SUCCESS',
        business_impact: result.changes?.cells_reassigned ? 'CLIENT_CELLS_REASSIGNED' : 'CLIENT_INFORMATION_UPDATED'
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in updateClientWithCellReassignment controller:", error);
    
    await req.logError(error, {
      controller: 'client',
      action: 'updateClientWithCellReassignment',
      client_id: req.params.client_id,
      update_data_keys: Object.keys(req.body || {}),
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'CLIENT_COMPREHENSIVE_UPDATE_FAILED'
    });

    return res.status(500).json({
      success: false,
      message: "Error updating client with cell reassignment",
      error: error.message
    });
  }
}

/**
 * ✅ NEW: Get client cell reassignment options
 */
async function getClientCellReassignmentOptions(req, res) {
  try {
    const { client_id } = req.params;
    
    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required"
      });
    }

    const result = await clientService.getClientCellReassignmentOptions(client_id);
    
    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getClientCellReassignmentOptions controller:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving client cell reassignment options",
      error: error.message
    });
  }
}

/**
 * ✅ NEW: Bulk update clients
 */
async function bulkUpdateClients(req, res) {
  try {
    const { client_updates } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    
    // Validate input
    if (!client_updates || !Array.isArray(client_updates) || client_updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Client updates array is required and must not be empty"
      });
    }

    // Only allow warehouse incharge and admin to perform bulk operations
    if (!["WAREHOUSE_INCHARGE", "ADMIN"].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only warehouse incharge and admin can perform bulk client updates."
      });
    }

    // Log bulk update attempt
    await req.logEvent(
      'BULK_CLIENT_UPDATE_STARTED',
      'Client',
      'BULK_OPERATION',
      `Started bulk client update for ${client_updates.length} clients`,
      null,
      {
        total_clients: client_updates.length,
        client_ids: client_updates.map(u => u.client_id),
        initiated_by: userId,
        initiator_role: userRole,
        bulk_update_timestamp: new Date().toISOString()
      },
      { operation_type: 'CLIENT_MANAGEMENT', action_type: 'BULK_UPDATE_START' }
    );

    const result = await clientService.bulkUpdateClients(client_updates, userId);

    // Log bulk update completion
    await req.logEvent(
      'BULK_CLIENT_UPDATE_COMPLETED',
      'Client',
      'BULK_OPERATION',
      `Completed bulk client update: ${result.data.successful_updates}/${result.data.total_processed} successful`,
      null,
      {
        total_processed: result.data.total_processed,
        successful_updates: result.data.successful_updates,
        failed_updates: result.data.failed_updates,
        success_rate: `${((result.data.successful_updates / result.data.total_processed) * 100).toFixed(1)}%`,
        completed_by: userId,
        completor_role: userRole
      },
      { 
        operation_type: 'CLIENT_MANAGEMENT', 
        action_type: 'BULK_UPDATE_SUCCESS',
        business_impact: 'MULTIPLE_CLIENTS_UPDATED'
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in bulkUpdateClients controller:", error);
    
    await req.logError(error, {
      controller: 'client',
      action: 'bulkUpdateClients',
      client_updates_count: req.body?.client_updates?.length || 0,
      user_id: req.user?.id,
      user_role: req.user?.role,
      error_context: 'BULK_CLIENT_UPDATE_FAILED'
    });

    return res.status(500).json({
      success: false,
      message: "Error in bulk client update",
      error: error.message
    });
  }
}


// ✅ NEW: Get next client code
async function getNextClientCode(req, res) {
  try {
    const result = await clientService.getNextClientCode();
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error in getNextClientCode controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate next client code",
      error: error.message
    });
  }
}

module.exports = {
  createClient,
  getAllClients,
  getClientById,
  updateClient,
  updateClientWithCellReassignment,
  getClientCellReassignmentOptions,
  bulkUpdateClients,
  assignCellsToClient,
  getClientCellAssignments,
  getAvailableCellsForClient,
  getAvailableCellsWithClientAssignments,
  deactivateClientCellAssignment,
  getClientFormFields,
  getClientStatistics,
  getClientCredentials,
  createTestClient,
  getPendingCredentials,
  getClientCredentialsById,
  markCredentialsHandedOver,
  getNextClientCode,
}; 