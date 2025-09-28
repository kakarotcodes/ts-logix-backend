// src/modules/product/product.route.ts
const express = require('express');
const multer = require('multer');
const router = express.Router();
const productController = require('./product.controller');

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
      'application/octet-stream', // For Excel files that may be detected as binary
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

// router.use(authenticateToken);

// IMPORTANT: Define static routes before dynamic ones.
// This prevents static routes (e.g., '/form-fields') from being interpreted as dynamic parameters (e.g., '/:id').
router.get('/form-fields', productController.getFormFields);

// ✅ NEW: Category system routes
router.get('/categories', productController.getProductCategories);
router.post('/categories', productController.createProductCategory);
router.get('/subcategories1', productController.getSubCategories1);
router.post('/subcategories1', productController.createSubCategory1);
router.get('/subcategories2', productController.getSubCategories2);
router.post('/subcategories2', productController.createSubCategory2);

// ✅ DEPRECATED: Keep old routes for backward compatibility
router.get('/temperature-ranges', productController.getTemperatureRanges);

// ✅ NEW: Bulk upload routes
router.get('/bulk-template', productController.getBulkUploadTemplate);
router.post('/bulk-upload', upload.single('file'), productController.processBulkUpload);

router.route('/')
  .post(upload.array('uploaded_documents', 10), productController.createProduct)
  .get(productController.getAllProducts);

router.route('/:id')
  .get(productController.getProductById)
  .put(productController.updateProduct)
  .delete(productController.deleteProduct);

module.exports = router;


