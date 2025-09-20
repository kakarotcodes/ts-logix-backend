const {
  generateWarehouseReport,
  generateProductCategoryReport,
  generateProductWiseReport,
  generateCardexReport,
} = require("./reports.service");

const { generateMasterReport } = require("./masterReport.service");

async function getWarehouseReport(req, res) {
  try {
    // Extract filter parameters from query string
    const filters = {
      date_from: req.query.date_from || null,
      date_to: req.query.date_to || null,
      customer_name: req.query.customer_name || null,
      customer_code: req.query.customer_code || null,
      product_name: req.query.product_name || null,
      product_code: req.query.product_code || null,
      warehouse_id: req.query.warehouse_id || null,
      quality_status: req.query.quality_status || null
    };

    // Get user context from JWT token
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role
    };

    console.log(`📊 WAREHOUSE REPORT REQUEST: User ${userContext.userId} (${userContext.userRole}) requesting report with filters:`, filters);

    // Generate the warehouse report
    const reportResult = await generateWarehouseReport(filters, userContext);

    if (!reportResult.success) {
      return res.status(500).json({
        success: false,
        message: reportResult.message,
        error: reportResult.error
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      message: reportResult.message,
      data: reportResult.data,
      summary: reportResult.summary,
      filters_applied: reportResult.filters_applied,
      user_role: reportResult.user_role,
      is_client_filtered: reportResult.is_client_filtered,
      report_generated_at: reportResult.report_generated_at,
      processing_time_ms: reportResult.processing_time_ms
    });

  } catch (error) {
    console.error("Error in getWarehouseReport controller:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating warehouse report",
      error: error.message
    });
  }
}

async function getProductCategoryReport(req, res) {
  try {
    // Extract filter parameters from query string
    const filters = {
      date_from: req.query.date_from || null,
      date_to: req.query.date_to || null,
      customer_name: req.query.customer_name || null,
      customer_code: req.query.customer_code || null,
      product_name: req.query.product_name || null,
      product_code: req.query.product_code || null,
    };

    // Get user context from JWT token
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role
    };

    console.log(`📊 PRODUCT CATEGORY REPORT REQUEST: User ${userContext.userId} (${userContext.userRole}) requesting report with filters:`, filters);

    // Generate the product category report
    const reportResult = await generateProductCategoryReport(filters, userContext);

    if (!reportResult.success) {
      return res.status(500).json({
        success: false,
        message: reportResult.message,
        error: reportResult.error
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      message: reportResult.message,
      data: reportResult.data,
      summary: reportResult.summary,
      filters_applied: reportResult.filters_applied,
      user_role: reportResult.user_role,
      is_client_filtered: reportResult.is_client_filtered,
      report_generated_at: reportResult.report_generated_at,
      processing_time_ms: reportResult.processing_time_ms
    });

  } catch (error) {
    console.error("Error in getProductCategoryReport controller:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating product category report",
      error: error.message
    });
  }
}

async function getProductWiseReport(req, res) {
  try {
    // Extract filter parameters from query string
    const filters = {
      date_from: req.query.date_from || null,
      date_to: req.query.date_to || null,
      customer_name: req.query.customer_name || null,
      customer_code: req.query.customer_code || null,
      product_name: req.query.product_name || null,
      product_code: req.query.product_code || null,
    };

    // Get user context from JWT token
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role
    };

    console.log(`📊 PRODUCT WISE REPORT REQUEST: User ${userContext.userId} (${userContext.userRole}) requesting report with filters:`, filters);

    // Generate the product wise report
    const reportResult = await generateProductWiseReport(filters, userContext);

    if (!reportResult.success) {
      return res.status(500).json({
        success: false,
        message: reportResult.message,
        error: reportResult.error
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      message: reportResult.message,
      data: reportResult.data,
      summary: reportResult.summary,
      filters_applied: reportResult.filters_applied,
      user_role: reportResult.user_role,
      is_client_filtered: reportResult.is_client_filtered,
      report_generated_at: reportResult.report_generated_at,
      processing_time_ms: reportResult.processing_time_ms
    });

  } catch (error) {
    console.error("Error in getProductWiseReport controller:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating product wise report",
      error: error.message
    });
  }
}

async function getCardexReport(req, res) {
  try {
    // Extract filter parameters from query string
    const filters = {
      date_from: req.query.date_from || null,
      date_to: req.query.date_to || null,
      customer_name: req.query.customer_name || null,
      customer_code: req.query.customer_code || null,
      product_name: req.query.product_name || null,
      product_code: req.query.product_code || null,
    };

    // Get user context from JWT token
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role
    };

    console.log(`📊 CARDEX REPORT REQUEST: User ${userContext.userId} (${userContext.userRole}) requesting report with filters:`, filters);

    // Generate the cardex report
    const reportResult = await generateCardexReport(filters, userContext);

    if (!reportResult.success) {
      return res.status(500).json({
        success: false,
        message: reportResult.message,
        error: reportResult.error
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      message: reportResult.message,
      data: reportResult.data,
      summary: reportResult.summary,
      filters_applied: reportResult.filters_applied,
      user_role: reportResult.user_role,
      is_client_filtered: reportResult.is_client_filtered,
      report_generated_at: reportResult.report_generated_at,
      processing_time_ms: reportResult.processing_time_ms
    });

  } catch (error) {
    console.error("Error in getCardexReport controller:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating cardex report",
      error: error.message
    });
  }
}

async function getMasterReport(req, res) {
  try {
    // Extract filter parameters from query string
    const filters = {
      date_from: req.query.date_from || null,
      date_to: req.query.date_to || null,
      date_filter_type: req.query.date_filter_type || 'dispatch', // 'entry', 'dispatch', or 'both'
      customer_name: req.query.customer_name || null,
      customer_code: req.query.customer_code || null,
      product_name: req.query.product_name || null,
      product_code: req.query.product_code || null,
      supplier_name: req.query.supplier_name || null,
      supplier_code: req.query.supplier_code || null,
      include_unallocated: req.query.include_unallocated === 'true' || false,
    };

    // Get user context from JWT token
    const userContext = {
      userId: req.user?.id,
      userRole: req.user?.role
    };

    console.log(`📊 MASTER REPORT REQUEST: User ${userContext.userId} (${userContext.userRole}) requesting report with filters:`, filters);

    // Generate the master report
    const reportResult = await generateMasterReport(filters, userContext);

    if (!reportResult.success) {
      return res.status(500).json({
        success: false,
        message: reportResult.message,
        error: reportResult.error
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      message: reportResult.message,
      data: reportResult.data,
      summary: reportResult.summary,
      filters_applied: reportResult.filters_applied,
      user_role: reportResult.user_role,
      report_generated_at: reportResult.report_generated_at,
      processing_time_ms: reportResult.processing_time_ms,
      total_records: reportResult.total_records
    });

  } catch (error) {
    console.error("Error in getMasterReport controller:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating master report",
      error: error.message
    });
  }
}

module.exports = {
  getWarehouseReport,
  getProductCategoryReport,
  getProductWiseReport,
  getCardexReport,
  getMasterReport,
};