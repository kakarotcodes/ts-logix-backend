const express = require("express");
const router = express.Router();
const {
  getWarehouseReport,
  getProductCategoryReport,
  getProductWiseReport,
  getCardexReport,
  getMasterReport,
} = require("./reports.controller");

// Warehouse report endpoint
router.get("/warehouse", getWarehouseReport);

// Product category report endpoint
router.get("/product-category", getProductCategoryReport);

// Product-wise stock in/out report endpoint
router.get("/product-wise", getProductWiseReport);

// Cardex report endpoint
router.get("/cardex", getCardexReport);

// Master report endpoint - comprehensive transaction-based report
router.get("/master", getMasterReport);

module.exports = router;