const express = require("express");
const multer = require("multer");
const departureController = require("./departure.controller");

const router = express.Router();

// Configure multer for file upload (memory storage for direct Supabase upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});

// ✅ ENHANCED: Form data endpoints
router.get("/departure-formfields", departureController.getDepartureFormFields);
router.get("/departure-exit-options", departureController.getDepartureExitOptions);
router.get("/current-departure-order-no", departureController.getCurrentDepartureOrderNo);
router.get("/permissions", departureController.getDeparturePermissions);

// ✅ NEW: Expiry urgency dashboard for departure planning
router.get("/expiry-urgency-dashboard", departureController.getExpiryUrgencyDashboard);

// ✅ ENHANCED: Departure order management with approval workflow
router.get("/departure-orders", departureController.getAllDepartureOrders);
router.post("/create-departure-order", upload.array('documents', 10), departureController.createDepartureOrder);
router.get("/departure-orders/:departureOrderId", departureController.getDepartureOrderById);

// ✅ NEW: Update departure order (CLIENT users only, REVISION status only)
router.put("/departure-orders/:departureOrderId", upload.array('documents', 10), departureController.updateDepartureOrder);

// ✅ NEW: Comprehensive departure order creation
router.post("/comprehensive-orders", upload.array('documents', 10), departureController.createComprehensiveDepartureOrder);

// ✅ NEW: Get comprehensive departure orders
router.get("/comprehensive-orders", departureController.getComprehensiveDepartureOrders);

// ✅ NEW: Get single comprehensive departure order by order number
router.get("/comprehensive-orders/:orderNumber", departureController.getComprehensiveDepartureOrderByNumber);

// ✅ NEW: Approval workflow endpoints (WAREHOUSE_INCHARGE/ADMIN only)
router.post("/departure-orders/:departureOrderId/approve", departureController.approveDepartureOrder);
router.post("/departure-orders/:departureOrderId/reject", departureController.rejectDepartureOrder);
router.post("/departure-orders/:departureOrderId/request-revision", departureController.requestRevisionDepartureOrder);

// ✅ NEW: Dispatch endpoints (WAREHOUSE_INCHARGE/ADMIN only) - separate from approval
router.post("/departure-orders/:departureOrderId/dispatch", departureController.dispatchDepartureOrder);
router.post("/departure-orders/:departureOrderId/auto-dispatch", departureController.autoDispatchDepartureOrder);
router.post("/departure-orders/batch-dispatch", departureController.batchDispatchDepartureOrders);

// ✅ ENHANCED: EXPIRY-BASED FIFO Product-wise departure flow
router.get("/products/:productId/fifo-locations", departureController.getFifoLocationsForProduct);
router.get("/products/:productId/fifo-allocation", departureController.getSuggestedFifoAllocation);

// ✅ ENHANCED: Inventory management endpoints for departure (product-based flow with expiry FIFO)
router.get("/products-with-inventory", departureController.getProductsWithInventory);
router.get("/cells-for-entry-product/:entryOrderProductId", departureController.getAvailableCellsForProduct);

// ✅ ENHANCED: Departure inventory summary with expiry tracking
router.get("/inventory-summary", departureController.getDepartureInventorySummary);

// ✅ ENHANCED: Cell validation endpoints with expiry consideration
router.post("/validate-cell", departureController.validateSelectedCell);
router.post("/validate-multiple-cells", departureController.validateMultipleCells);

// ✅ NEW: Get audit trail for departure order
router.get("/departure-orders/:departureOrderId/audit-trail", departureController.getDepartureOrderAuditTrail);

// ✅ NEW: Allocation endpoints (WAREHOUSE_INCHARGE/ADMIN only)
router.get("/departure-orders/:departureOrderId/available-inventory", departureController.getAvailableInventoryForDeparture);
router.post("/departure-orders/:departureOrderId/allocate", departureController.createDepartureAllocations);

// ✅ NEW: Direct dispatch flow endpoints (similar to cell assignment flow)
router.get("/approved-departure-orders", departureController.getApprovedDepartureOrdersForDispatch);
router.post("/departure-orders/:departureOrderId/auto-select-inventory", departureController.getAutoSelectedInventoryForDispatch);
router.get("/warehouse-dispatch-summary", departureController.getWarehouseDispatchSummary);
router.post("/dispatch-approved-order", upload.array('documents', 10), departureController.dispatchApprovedDepartureOrder);

// ✅ NEW: Partial dispatch support endpoints
router.get("/departure-orders/:departureOrderId/products/:productId/recalculated-fifo", departureController.getRecalculatedFifoInventoryForDeparture);
router.post("/departure-orders/:departureOrderId/release-held-inventory", departureController.releaseHeldInventoryForDeparture);

// ✅ NEW: Bulk departure order upload endpoints
router.post("/bulk-upload", upload.single('file'), departureController.processBulkDepartureOrders);
router.get("/bulk-template", departureController.generateBulkDepartureTemplate);

module.exports = router;