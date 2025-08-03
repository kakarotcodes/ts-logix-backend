const express = require("express");
const router = express.Router();
const {
  allocatePallets,
  listWarehouseCells,
  listWarehouses,
  changeCellRole,
  getCellRoles,
  getCellHistory,
  getCellsByQualityRole,
} = require("./warehouse.controller");

// Allocate pallets to cells
router.post("/allocate", allocatePallets);

// List all cells (optional warehouse filter)
router.get("/cells", listWarehouseCells);

router.get("/warehouses", listWarehouses);

// ✅ SIMPLIFIED: Cell role management routes
router.get("/cell-roles", getCellRoles);                       // Get available cell roles
router.put("/cells/:cellId/role", changeCellRole);             // Change cell role
router.get("/cells/by-role", getCellsByQualityRole);          // Get cells grouped by role

module.exports = router;
