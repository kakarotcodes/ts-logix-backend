// src/modules/authentication/auth.route.js
const express = require("express");
const authController = require("./auth.controller");
const authenticateToken = require("../../middlewares/authMiddleware");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.put("/change-password", authenticateToken, authController.changePassword);

// ✅ NEW: Profile management routes
router.get("/profile", authenticateToken, authController.getProfile);
router.put("/profile/client-users/:client_user_id/password", authenticateToken, authController.changeClientUserPassword);

module.exports = router;