// src/modules/authentication/auth.route.js
const express = require("express");
const authController = require("./auth.controller");
const authenticateToken = require("../../middlewares/authMiddleware");

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.put("/change-password", authenticateToken, authController.changePassword);

module.exports = router;