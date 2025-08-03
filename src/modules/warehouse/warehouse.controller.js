const { 
  assignPallets, 
  getAllWarehouseCells, 
  fetchWarehouses,
  changeCellQualityPurpose,
  getCellRoleChangeHistory,
  getCellsByRole
} = require("./warehouse.service");

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function allocatePallets(req, res) {
  const { warehouse_id, row, palletCount, product_id } = req.body;
  const user_id = req.user?.id || req.body.user_id;
  try {
    const slots = await assignPallets(
      warehouse_id,
      row,
      palletCount,
      product_id,
      user_id
    );
    return res.status(201).json({ message: "Pallets assigned", slots });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}

async function listWarehouseCells(req, res) {
  try {
    const filter = {};
    if (req.query.warehouse_id) filter.warehouse_id = req.query.warehouse_id;
    
    // ✅ NEW: Add user context for client-based filtering
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role // JWT token includes role name directly
    };
    
    const allCells = await getAllWarehouseCells(filter, userContext);
    
    // Apply additional filters based on query parameters
    let filteredCells = allCells;
    
    // Filter by assignment status
    if (req.query.assigned_to_client !== undefined) {
      const isAssigned = req.query.assigned_to_client === 'true';
      filteredCells = filteredCells.filter(cell => cell.is_assigned_to_client === isAssigned);
    }
    
    // Filter by cell status
    if (req.query.status) {
      filteredCells = filteredCells.filter(cell => cell.status === req.query.status);
    }
    
    // Filter by cell role
    if (req.query.cell_role) {
      filteredCells = filteredCells.filter(cell => cell.cell_role === req.query.cell_role);
    }
    
    // ✅ NEW: Filter by passage cells if requested
    if (req.query.include_passages !== undefined) {
      const includePassages = req.query.include_passages === 'true';
      if (!includePassages) {
        filteredCells = filteredCells.filter(cell => !cell.is_passage);
      }
    }
    
    // Get summary statistics - exclude passage cells from storage counts
    const storageCells = allCells.filter(cell => !cell.is_passage);
    const filteredStorageCells = filteredCells.filter(cell => !cell.is_passage);
    
    const summary = {
      // Total counts (including passages for reference)
      total_cells: allCells.length,
      filtered_cells: filteredCells.length,
      
      // Storage cell counts (excluding passages)
      total_storage_cells: storageCells.length,
      filtered_storage_cells: filteredStorageCells.length,
      assigned_to_clients: storageCells.filter(cell => cell.is_assigned_to_client).length,
      unassigned_cells: storageCells.filter(cell => !cell.is_assigned_to_client).length,
      available_cells: storageCells.filter(cell => cell.status === 'AVAILABLE').length,
      occupied_cells: storageCells.filter(cell => cell.status === 'OCCUPIED').length,
      cells_with_inventory: storageCells.filter(cell => cell.has_inventory).length,
      
      // Passage cell statistics (for reference)
      passage_cells: allCells.filter(cell => cell.is_passage).length,
      
      // User context info
      user_role: userContext.userRole,
      is_client_filtered: userContext.userRole && !['ADMIN', 'WAREHOUSE_INCHARGE'].includes(userContext.userRole)
    };
    
    return res.status(200).json({ 
      success: true,
      message: "Cells fetched successfully", 
      data: filteredCells,
      summary
    });
  } catch (err) {
    return res
      .status(500)
      .json({ 
        success: false,
        message: "Error fetching cells", 
        error: err.message 
      });
  }
}

async function listWarehouses(req, res) {
  try {
    // ✅ NEW: Add user context for client-based filtering
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role // JWT token includes role name directly
    };
    
    const list = await fetchWarehouses(userContext);
    
    return res.status(200).json({ 
      success: true,
      message: "Warehouses fetched successfully", 
      count: list.length,
      data: list,
      // ✅ NEW: Add filtering context info
      user_role: userContext.userRole,
      is_client_filtered: userContext.userRole && !['ADMIN', 'WAREHOUSE_INCHARGE'].includes(userContext.userRole)
    });
  } catch (err) {
    console.error("Error fetching warehouses:", err);
    return res.status(500).json({ 
      success: false,
      message: "Error fetching warehouses", 
      error: err.message 
    });
  }
}

/**
 * ✅ SIMPLIFIED: Change cell role (ADMIN only)
 */
async function changeCellRole(req, res) {
  try {
    const { cellId } = req.params;
    const { new_cell_role } = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    // Only ADMIN can change cell roles
    if (userRole !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: "Only ADMIN users can change cell roles"
      });
    }

    if (!cellId) {
      return res.status(400).json({
        success: false,
        message: "Cell ID is required"
      });
    }

    if (!new_cell_role) {
      return res.status(400).json({
        success: false,
        message: "New cell role is required"
      });
    }

    // Validate cell role
    const validRoles = ['STANDARD', 'REJECTED', 'SAMPLES', 'RETURNS'];
    if (!validRoles.includes(new_cell_role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid cell role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    // Get current cell
    const currentCell = await prisma.warehouseCell.findUnique({
      where: { id: cellId }
    });

    if (!currentCell) {
      return res.status(404).json({
        success: false,
        message: "Cell not found"
      });
    }

    // Update cell role
    const updatedCell = await prisma.warehouseCell.update({
      where: { id: cellId },
      data: { cell_role: new_cell_role }
    });

    return res.status(200).json({
      success: true,
      message: `Cell role changed from ${currentCell.cell_role} to ${new_cell_role}`,
      data: {
        cell_id: updatedCell.id,
        cell_reference: `${updatedCell.row}.${String(updatedCell.bay).padStart(2, '0')}.${String(updatedCell.position).padStart(2, '0')}`,
        old_role: currentCell.cell_role,
        new_role: updatedCell.cell_role
      }
    });

  } catch (error) {
    console.error("Error in changeCellRole controller:", error);
    
    return res.status(500).json({
      success: false,
      message: "Failed to change cell role",
      error: error.message
    });
  }
}

/**
 * ✅ NEW: Get available cell roles for dropdown
 */
async function getCellRoles(req, res) {
  try {
    const cellRoles = [
      { value: 'STANDARD', label: 'Standard Storage' },
      { value: 'REJECTED', label: 'Rejected' },
      { value: 'SAMPLES', label: 'Samples' },
      { value: 'RETURNS', label: 'Returns' }
    ];

    return res.status(200).json({
      success: true,
      message: "Cell roles retrieved successfully",
      data: cellRoles
    });
  } catch (error) {
    console.error("Error in getCellRoles controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve cell roles",
      error: error.message
    });
  }
}

/**
 * ✅ NEW: Get cell role change history
 */
async function getCellHistory(req, res) {
  try {
    const { cellId } = req.params;

    if (!cellId) {
      return res.status(400).json({
        success: false,
        message: "Cell ID is required"
      });
    }

    const history = await getCellRoleChangeHistory(cellId);

    return res.status(200).json({
      success: true,
      message: "Cell role change history retrieved successfully",
      data: history,
      count: history.length
    });

  } catch (error) {
    console.error("Error in getCellHistory controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve cell role change history",
      error: error.message
    });
  }
}

/**
 * ✅ NEW: Get cells grouped by role for quality control management
 */
async function getCellsByQualityRole(req, res) {
  try {
    const { warehouse_id, cell_role } = req.query;

    const result = await getCellsByRole(warehouse_id, cell_role);

    return res.status(200).json({
      success: true,
      message: "Cells by role retrieved successfully",
      data: result,
      filters_applied: {
        warehouse_id: warehouse_id || 'all',
        cell_role: cell_role || 'all'
      }
    });

  } catch (error) {
    console.error("Error in getCellsByQualityRole controller:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve cells by role",
      error: error.message
    });
  }
}

module.exports = { 
  allocatePallets, 
  listWarehouseCells, 
  listWarehouses,
  changeCellRole,
  getCellRoles,
  getCellHistory,
  getCellsByQualityRole
};
