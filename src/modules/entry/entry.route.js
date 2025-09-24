const express = require("express");
const multer = require("multer");
const entryController = require("./entry.controller");

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
      'application/octet-stream', // Added for Excel files that may be detected as octet-stream
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'text/csv'
    ];

    // Also check file extension for Excel files
    const allowedExcelExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

    if (allowedTypes.includes(file.mimetype) || allowedExcelExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} with extension ${fileExtension} not allowed`), false);
    }
  }
});

// Entry form and creation routes
router.get("/entry-formfields", entryController.getEntryFormFields);
router.post("/create-entry-order", upload.array('documents', 10), entryController.createEntryOrder);
router.get("/current-order-number", entryController.getCurrentEntryOrderNo);

// Entry order listing and details routes
router.get("/entry-orders", entryController.getAllEntryOrders);
router.get("/entry-order/:orderNo", entryController.getEntryOrderByNo);

// ✅ UPDATED: Changed from "passed" to "approved" orders (removed audit flow)
router.get("/entry-orders/approved", entryController.getApprovedEntryOrders);

// ✅ NEW: Review routes for Admin workflow
router.put("/entry-order/:orderNo/review", entryController.reviewEntryOrder);

// ✅ NEW: Get orders by status for different user roles
router.get("/entry-orders/status/:status", entryController.getEntryOrdersByStatus);

// ✅ NEW: Update entry order route (only for NEEDS_REVISION status)
router.put("/entry-order/:orderNo/update", entryController.updateEntryOrder);

// ✅ NEW: Bulk operations routes
router.post("/bulk-upload", upload.single('bulk_file'), entryController.processBulkEntryOrders);
router.get("/bulk-template", entryController.generateBulkTemplate);

module.exports = router;