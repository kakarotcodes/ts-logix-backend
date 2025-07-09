require("module-alias/register");
require("dotenv").config(); // ✅ Load environment variables
const express = require("express");
const cors = require("cors");
const app = express();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Configure CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://localhost:6969",
      "http://localhost:7070",
      "https://ts-logix.vercel.app",
      "https://tslwms.pe"
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// 2. Body parsing middleware **must** come before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// middleware
const authenticateToken = require("@/middlewares/authMiddleware");
const { eventLoggerMiddleware, errorLoggerMiddleware } = require("@/middlewares/eventLoggerMiddleware");

// Apply event logging middleware globally
app.use(eventLoggerMiddleware);

// ✅ NEW: Test endpoint for Supabase debugging
app.get("/test-supabase", async (req, res) => {
  try {
    const { testSupabaseConnection } = require("./utils/supabase");
    const result = await testSupabaseConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ✅ NEW: Test endpoint for comprehensive departure order with documents
app.get("/test-comprehensive-departure", async (req, res) => {
  try {
    const multer = require("multer");
    const upload = multer({ storage: multer.memoryStorage() });
    
    res.json({
      success: true,
      message: "Comprehensive departure order endpoint ready",
      endpoints: {
        "POST /departure/comprehensive-orders": "Create comprehensive departure order with documents",
        "GET /departure/comprehensive-orders": "Get all comprehensive departure orders",
        "GET /departure/comprehensive-orders/:orderNumber": "Get specific comprehensive departure order"
      },
      document_upload: {
        field_name: "documents",
        max_files: 10,
        max_size: "10MB",
        supported_types: ["PDF", "DOC", "DOCX", "XLS", "XLSX", "JPG", "PNG", "GIF", "TXT", "CSV"]
      },
      form_fields: {
        required: ["departure_order_no", "document_date", "departure_date_time"],
        optional: ["document_types", "observation", "total_weight", "total_pallets"]
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// routes
const authRoutes = require("@/modules/auth/auth.route");
const organisationRoutes = require("@/modules/organisation/organisation.route");
const countryRoutes = require("@/modules/organisation/country.route"); // ✅ NEW: Countries routes
// const processesRoutes = require("@/modules/processes/processes.route");
const maintenanceRoutes = require("@/modules/maintenance/maintenance.route");
const supplierRoutes = require("@/modules/supplier/supplier.route");
const productRoutes = require("@/modules/product/product.route");
const entryRoutes = require("@/modules/entry/entry.route");
const departureRoutes = require("@/modules/departure/departure.route");
const auditRoutes = require("@/modules/audit/audit.route");
const inventoryRoutes = require("@/modules/inventory/inventory.route");
const warehouseRoutes = require("@/modules/warehouse/warehouse.route");
const clientRoutes = require("@/modules/client/client.route");
const eventLogRoutes = require("@/modules/eventlog/eventlog.route");
const reportsRoutes = require("@/modules/reports/reports.route");

// ✅ NEW: Document management routes for file uploads/downloads
const documentRoutes = require("./modules/departure/document.route");

// Mount your module routes
app.use("/auth", authRoutes);
app.use("/organisation", organisationRoutes);
app.use("/countries", authenticateToken, countryRoutes); // ✅ NEW: Mount countries routes
// app.use("/processes", authenticateToken, processesRoutes);
app.use("/maintenance", authenticateToken, maintenanceRoutes);
app.use("/suppliers", authenticateToken, supplierRoutes);
app.use("/products", authenticateToken, productRoutes);
app.use("/entry", authenticateToken, entryRoutes);
app.use("/departure", authenticateToken, departureRoutes);
app.use("/audit", authenticateToken, auditRoutes);
app.use("/inventory", authenticateToken, inventoryRoutes);
app.use("/warehouse", authenticateToken, warehouseRoutes);
app.use("/clients", authenticateToken, clientRoutes); // ✅ NEW: Mount client routes
app.use("/eventlogs", authenticateToken, eventLogRoutes); // ✅ NEW: Mount event log routes
app.use("/reports", authenticateToken, reportsRoutes); // ✅ NEW: Mount reports routes

// ✅ NEW: Document management endpoints for all entities
app.use("/documents", documentRoutes);

// Apply error logging middleware
app.use(errorLoggerMiddleware);

app.get("/", (req, res) => {
  res.send("Hello world");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
