const express = require("express");
const router = express.Router();
const clientController = require("./client.controller");

// ✅ DEBUG/TEST endpoints (before CRUD to avoid conflicts)
router.get("/credentials", clientController.getClientCredentials);
router.post("/test-client", clientController.createTestClient);

// ✅ NEW: Credential handover endpoints
router.get("/credentials/pending", clientController.getPendingCredentials);
router.get("/credentials/:client_id", clientController.getClientCredentialsById);
router.put("/credentials/:client_id/handed-over", clientController.markCredentialsHandedOver);

// Client CRUD operations
router.post("/", clientController.createClient);
router.get("/", clientController.getAllClients);
router.get("/form-fields", clientController.getClientFormFields);
router.get("/statistics", clientController.getClientStatistics);
router.get("/next-code", clientController.getNextClientCode);
router.get("/:client_id", clientController.getClientById);
router.put("/:client_id", clientController.updateClient);


// ✅ NEW: Enhanced client editing with cell reassignment
router.put("/:client_id/comprehensive-update", clientController.updateClientWithCellReassignment);
router.get("/:client_id/cell-reassignment-options", clientController.getClientCellReassignmentOptions);
router.post("/bulk-update", clientController.bulkUpdateClients);

// Cell assignment operations
router.post("/assign-cells", clientController.assignCellsToClient);
router.post("/assign-cell", clientController.assignCellsToClient); // Alias for singular form
router.get("/:client_id/cell-assignments", clientController.getClientCellAssignments);
router.get("/cells/available", clientController.getAvailableCellsForClient);
router.get("/cells/available-with-assignments", clientController.getAvailableCellsWithClientAssignments);
router.put("/cell-assignments/:assignment_id/deactivate", clientController.deactivateClientCellAssignment);

// ✅ NEW: Client User Management endpoints
router.post("/:client_id/users", clientController.addClientUsers);
router.get("/:client_id/users", clientController.getClientUsers);
router.put("/users/:client_user_id/password", clientController.updateClientUserPassword);
router.put("/users/:client_user_id/deactivate", clientController.deactivateClientUser);

// ✅ NEW: Password change for users in client_users_data (UI-friendly endpoint)
router.put("/:client_id/users/:username/change-password", clientController.changeClientUserPasswordByUsername);

module.exports = router; 