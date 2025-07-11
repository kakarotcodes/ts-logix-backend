const { assignPallets, getAllWarehouseCells, fetchWarehouses } = require("./warehouse.service");

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

module.exports = { allocatePallets, listWarehouseCells, listWarehouses };
