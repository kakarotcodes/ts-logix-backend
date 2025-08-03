const express = require('express');
const router = express.Router();
const supplierController = require('./supplier.controller');



// IMPORTANT: Define static routes before dynamic ones.
// This prevents static routes (e.g., '/form-fields') from being interpreted as dynamic parameters (e.g., '/:id').
router.get('/form-fields', supplierController.getFormFields);
router.get('/categories', supplierController.getSupplierCategories);
router.get('/next-code', supplierController.getNextSupplierCode);

// ✅ NEW: Client-supplier assignment routes
router.post('/assign-to-client', supplierController.createClientSupplierAssignments);
router.get('/client/:client_id/assignments', supplierController.getClientSupplierAssignments);
router.get('/client/:client_id/available', supplierController.getAvailableSuppliersForClient);
router.get('/client/:client_id', supplierController.getClientById);
router.delete('/assignments/:assignment_id', supplierController.removeClientSupplierAssignment);

router.route('/')
  .post(supplierController.createSupplier)
  .get(supplierController.getAllSuppliers);

router.route('/:id')
  .get(supplierController.getSupplierById)
  .put(supplierController.updateSupplier)
  .delete(supplierController.deleteSupplier);

module.exports = router;