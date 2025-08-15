const express = require("express");
const router = express.Router();
const controller = require("./inventory.controller");

// Get approved entry orders ready for inventory assignment
router.get("/approved-entry-orders", controller.getApprovedEntryOrdersForInventory);

// Get specific entry order products for inventory assignment
router.get("/entry-order/:entryOrderId/products", controller.getEntryOrderProductsForInventory);

// Assign a specific product to a warehouse cell
router.post("/assign-product", controller.assignProductToCell);

// Get inventory summary with filters
// Query params: warehouse_id, product_id, product_name, product_code, client_name, status, include_logs, include_dispatch_history
router.get("/summary", controller.getInventorySummary);

// Get available cells for a specific warehouse
router.get("/warehouses/:warehouse_id/available-cells", controller.getAvailableCellsForWarehouse);

// Fetch all warehouses and cells
router.get("/warehouses", controller.fetchWarehouses);
router.get("/warehouses/:warehouse_id/cells", controller.fetchCells);

// ✅ NEW: Quality control routes
// Get inventory in quarantine for quality control
router.get("/quarantine", controller.getQuarantineInventory);

// ✅ NEW: Get inventory by any quality status (dynamic)
router.get("/by-quality-status", controller.getInventoryByQualityStatus);

// Transition inventory from quarantine to other quality states
router.post("/quality-transition", controller.transitionQualityStatus);

// Get available inventory for departure orders (only approved items)
router.get("/available-for-departure", controller.getAvailableInventoryForDeparture);

// Get audit trail for inventory operations
router.get("/audit-trail", controller.getInventoryAuditTrail);

// ✅ NEW: Validate inventory synchronization across the system
router.get("/validate-synchronization", controller.validateInventorySynchronization);

// ✅ NEW: Get cells filtered by quality status for transitions
router.get("/cells-by-quality-status", controller.getCellsByQualityStatus);

// ✅ NEW: Simplified allocation flow routes
// Get comprehensive allocation helper information for an entry order
router.get("/entry-order/:entryOrderId/allocation-helper", controller.getEntryOrderAllocationHelper);

// Bulk assign all products in an entry order in one operation
router.post("/bulk-assign-entry-order", controller.bulkAssignEntryOrder);

module.exports = router;