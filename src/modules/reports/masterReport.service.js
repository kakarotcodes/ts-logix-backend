const prisma = require("@/db");

/**
 * Generate Master Report with complete transaction flow (entry → dispatch)
 * Each row represents a complete traceability path from entry to dispatch
 */
async function generateMasterReport(filters, userContext) {
  const startTime = Date.now();

  try {
    // Build where conditions for filtering
    const whereConditions = buildWhereConditions(filters, userContext);

    // Main query: Get all departure allocations with complete traceability
    const transactions = await prisma.departureAllocation.findMany({
      where: whereConditions,
      include: {
        // Inventory allocation links to entry
        inventory_allocation: {
          include: {
            // Entry order product details
            entry_order_product: {
              include: {
                // Product master data
                product: {
                  include: {
                    category: true,
                    subcategory1: true,
                    subcategory2: true
                  }
                },
                // Entry order details
                entry_order: {
                  include: {
                    supplier: true,
                    client: true,
                    customer: true,
                    created_by: {
                      select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true
                      }
                    }
                  }
                }
              }
            },
            // Warehouse cell information
            cell: {
              include: {
                warehouse: true
              }
            }
          }
        },
        // Departure order product details
        departure_order_product: {
          include: {
            // Departure order details
            departure_order: {
              include: {
                client: true,
                customer: true,
                approved_by: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                  }
                },
                created_by: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                  }
                }
              }
            },
            product: true
          }
        }
      },
      orderBy: [
        { departure_order_product: { departure_order: { departure_date_time: 'desc' } } },
        { inventory_allocation: { entry_order_product: { entry_order: { entry_date_time: 'desc' } } } }
      ]
    });

    // Also get unallocated inventory (entries without dispatches)
    let unallocatedInventory = [];
    if (filters.include_unallocated) {
      unallocatedInventory = await getUnallocatedInventory(filters, userContext);
    }

    // Transform data into master report format
    const reportData = await transformToMasterReport(transactions, unallocatedInventory);

    // Calculate summary statistics
    const summary = calculateSummary(reportData);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      message: "Master report generated successfully",
      data: reportData,
      summary: summary,
      filters_applied: filters,
      user_role: userContext.userRole,
      report_generated_at: new Date().toISOString(),
      processing_time_ms: processingTime,
      total_records: reportData.length
    };

  } catch (error) {
    console.error("Error generating master report:", error);
    return {
      success: false,
      message: "Failed to generate master report",
      error: error.message
    };
  }
}

/**
 * Build where conditions based on filters and user role
 */
function buildWhereConditions(filters, userContext) {
  let whereConditions = {};

  // Date range filtering
  if (filters.date_from || filters.date_to) {
    const dateFilter = {};
    if (filters.date_from) {
      dateFilter.gte = new Date(filters.date_from);
    }
    if (filters.date_to) {
      const endDate = new Date(filters.date_to);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }

    // Apply date filter to both entry and dispatch dates based on filter type
    if (filters.date_filter_type === 'entry') {
      whereConditions.inventory_allocation = {
        entry_order_product: {
          entry_order: {
            entry_date_time: dateFilter
          }
        }
      };
    } else if (filters.date_filter_type === 'dispatch') {
      whereConditions.departure_order_product = {
        departure_order: {
          departure_date_time: dateFilter
        }
      };
    } else {
      // Default: filter by dispatch date
      whereConditions.departure_order_product = {
        departure_order: {
          departure_date_time: dateFilter
        }
      };
    }
  }

  // Product filtering
  if (filters.product_name || filters.product_code) {
    const productFilter = {};
    if (filters.product_name) {
      productFilter.product_name = { contains: filters.product_name, mode: 'insensitive' };
    }
    if (filters.product_code) {
      productFilter.product_code = { contains: filters.product_code, mode: 'insensitive' };
    }

    if (!whereConditions.inventory_allocation) {
      whereConditions.inventory_allocation = {};
    }
    whereConditions.inventory_allocation.entry_order_product = {
      ...whereConditions.inventory_allocation.entry_order_product,
      product: productFilter
    };
  }

  // Customer filtering
  if (filters.customer_name || filters.customer_code) {
    const customerFilter = {};

    if (filters.customer_name) {
      customerFilter.OR = [
        { client: { company_name: { contains: filters.customer_name, mode: 'insensitive' } } },
        { customer: { name: { contains: filters.customer_name, mode: 'insensitive' } } }
      ];
    }

    if (filters.customer_code) {
      customerFilter.OR = [
        ...(customerFilter.OR || []),
        { client: { client_code: { contains: filters.customer_code, mode: 'insensitive' } } }
      ];
    }

    if (!whereConditions.departure_order_product) {
      whereConditions.departure_order_product = {};
    }
    whereConditions.departure_order_product.departure_order = {
      ...whereConditions.departure_order_product.departure_order,
      ...customerFilter
    };
  }

  // Supplier filtering
  if (filters.supplier_name || filters.supplier_code) {
    const supplierFilter = {};
    if (filters.supplier_name) {
      supplierFilter.name = { contains: filters.supplier_name, mode: 'insensitive' };
    }
    if (filters.supplier_code) {
      supplierFilter.supplier_code = { contains: filters.supplier_code, mode: 'insensitive' };
    }

    if (!whereConditions.inventory_allocation) {
      whereConditions.inventory_allocation = {};
    }
    if (!whereConditions.inventory_allocation.entry_order_product) {
      whereConditions.inventory_allocation.entry_order_product = {};
    }
    whereConditions.inventory_allocation.entry_order_product.entry_order = {
      ...whereConditions.inventory_allocation.entry_order_product.entry_order,
      supplier: supplierFilter
    };
  }

  // Role-based filtering
  if (userContext.userRole === 'CLIENT') {
    const clientFilter = {
      OR: [
        {
          inventory_allocation: {
            entry_order_product: {
              entry_order: {
                client_id: userContext.userId
              }
            }
          }
        },
        {
          inventory_allocation: {
            entry_order_product: {
              entry_order: {
                customer_id: userContext.userId
              }
            }
          }
        },
        {
          departure_order_product: {
            departure_order: {
              client_id: userContext.userId
            }
          }
        },
        {
          departure_order_product: {
            departure_order: {
              customer_id: userContext.userId
            }
          }
        }
      ]
    };

    whereConditions = { ...whereConditions, ...clientFilter };
  }

  return whereConditions;
}

/**
 * Transform raw data into master report format
 */
async function transformToMasterReport(transactions, unallocatedInventory = []) {
  const reportData = [];

  // Process dispatched transactions
  for (const transaction of transactions) {
    const invAllocation = transaction.inventory_allocation;
    const entryProduct = invAllocation?.entry_order_product;
    const entryOrder = entryProduct?.entry_order;
    const depProduct = transaction.departure_order_product;
    const depOrder = depProduct?.departure_order;
    const product = entryProduct?.product;

    // Determine customer information
    let customerCode = '';
    let customerName = '';
    let customerAddress = '';

    // For dispatch customer
    if (depOrder?.client) {
      customerCode = depOrder.client.client_code || '';
      customerName = depOrder.client.company_name || `${depOrder.client.first_names || ''} ${depOrder.client.last_name || ''}`.trim();
      customerAddress = depOrder.client.address || '';
    } else if (depOrder?.customer) {
      customerCode = depOrder.customer.customer_code || '';
      customerName = depOrder.customer.name || '';
      customerAddress = depOrder.customer.address || '';
    }

    // For entry customer (if different)
    let entryCustomerCode = '';
    let entryCustomerName = '';
    if (entryOrder?.client) {
      entryCustomerCode = entryOrder.client.client_code || '';
      entryCustomerName = entryOrder.client.company_name || `${entryOrder.client.first_names || ''} ${entryOrder.client.last_name || ''}`.trim();
    } else if (entryOrder?.customer) {
      entryCustomerCode = entryOrder.customer.customer_code || '';
      entryCustomerName = entryOrder.customer.name || '';
    }

    // Calculate costs
    const entryUnitCost = entryProduct?.insured_value && entryProduct?.inventory_quantity > 0
      ? parseFloat(entryProduct.insured_value) / parseFloat(entryProduct.inventory_quantity)
      : 0;

    const entryTotalCost = parseFloat(transaction.allocated_quantity || 0) * entryUnitCost;

    // For dispatch costs, use actual values if available
    const dispatchUnitCost = depProduct?.unit_price
      ? parseFloat(depProduct.unit_price)
      : entryUnitCost; // Fallback to entry cost

    const dispatchTotalCost = parseFloat(transaction.allocated_quantity || 0) * dispatchUnitCost;

    const reportRow = {
      // Customer & Product Information
      customer_code: customerCode,
      customer_name: customerName,
      product_code: product?.product_code || '',
      product_name: product?.product_name || '',
      product_category: product?.category?.category_name || '',
      product_subcategory1: product?.subcategory1?.subcategory_name || '',
      product_subcategory2: product?.subcategory2?.subcategory_name || '',

      // Packaging Information
      packing_type: getPackagingType(entryProduct?.packaging_type),
      packing_condition: getPackagingCondition(entryProduct?.packaging_status),

      // Entry Order Information
      entry_order_number: entryOrder?.entry_order_no || '',
      entry_order_date: entryOrder?.entry_date_time ? new Date(entryOrder.entry_date_time).toISOString().split('T')[0] : '',
      entry_order_guia: entryOrder?.guia_remision || '',
      entry_order_transport_guia: entryOrder?.transport_company_guide || '',
      entry_order_quantity: parseFloat(transaction.allocated_quantity || 0),
      entry_order_unit_cost: entryUnitCost.toFixed(2),
      entry_order_total_cost: entryTotalCost.toFixed(2),
      entry_order_currency: entryOrder?.currency || 'USD',
      entry_order_supplier_code: entryOrder?.supplier?.supplier_code || '',
      entry_order_supplier_name: entryOrder?.supplier?.name || '',
      entry_order_customer_code: entryCustomerCode,
      entry_order_customer_name: entryCustomerName,

      // Dispatch Order Information
      dispatch_order_number: depOrder?.departure_order_no || '',
      dispatch_order_date: depOrder?.departure_date_time ? new Date(depOrder.departure_date_time).toISOString().split('T')[0] : '',
      dispatch_order_guia: depOrder?.guia_remision || '',
      dispatch_order_transport_guia: depOrder?.transport_company_guide || '',
      dispatch_order_quantity: parseFloat(transaction.allocated_quantity || 0),
      dispatch_order_unit_cost: dispatchUnitCost.toFixed(2),
      dispatch_order_total_cost: dispatchTotalCost.toFixed(2),
      dispatch_order_currency: depOrder?.currency || 'USD',
      dispatch_order_customer_code: customerCode,
      dispatch_order_customer_name: customerName,
      dispatch_order_customer_address: customerAddress,

      // TSL Personnel Information
      order_receiver_from_tsl: entryOrder?.created_by ?
        `${entryOrder.created_by.first_name || ''} ${entryOrder.created_by.last_name || ''}`.trim() : '',
      order_dispatcher_from_tsl: depOrder?.approved_by ?
        `${depOrder.approved_by.first_name || ''} ${depOrder.approved_by.last_name || ''}`.trim() :
        (depOrder?.created_by ? `${depOrder.created_by.first_name || ''} ${depOrder.created_by.last_name || ''}`.trim() : ''),

      // Additional Information
      lot_number: entryProduct?.lot_number || '',
      expiry_date: entryProduct?.expiry_date ? new Date(entryProduct.expiry_date).toISOString().split('T')[0] : '',
      warehouse_location: invAllocation?.cell ?
        `${invAllocation.cell.warehouse?.name || ''} - Row ${invAllocation.cell.row_number}.Bay ${String(invAllocation.cell.bay_number).padStart(2, '0')}.Pos ${String(invAllocation.cell.position_number).padStart(2, '0')}` : '',
      quality_status: invAllocation?.quality_control_status || '',
      remarks: depOrder?.remarks || entryOrder?.remarks || '',
      observations: depOrder?.observations || entryOrder?.observation || '',

      // Transaction metadata
      transaction_type: 'DISPATCHED',
      entry_to_dispatch_days: entryOrder?.entry_date_time && depOrder?.departure_date_time ?
        Math.floor((new Date(depOrder.departure_date_time) - new Date(entryOrder.entry_date_time)) / (1000 * 60 * 60 * 24)) : null
    };

    reportData.push(reportRow);
  }

  // Process unallocated inventory (entries without dispatches)
  for (const inventory of unallocatedInventory) {
    const entryProduct = inventory.entry_order_product;
    const entryOrder = entryProduct?.entry_order;
    const product = entryProduct?.product;

    // Determine customer information for entry
    let customerCode = '';
    let customerName = '';
    if (entryOrder?.client) {
      customerCode = entryOrder.client.client_code || '';
      customerName = entryOrder.client.company_name || `${entryOrder.client.first_names || ''} ${entryOrder.client.last_name || ''}`.trim();
    } else if (entryOrder?.customer) {
      customerCode = entryOrder.customer.customer_code || '';
      customerName = entryOrder.customer.name || '';
    }

    // Calculate entry costs
    const entryUnitCost = entryProduct?.insured_value && entryProduct?.inventory_quantity > 0
      ? parseFloat(entryProduct.insured_value) / parseFloat(entryProduct.inventory_quantity)
      : 0;

    const entryTotalCost = parseFloat(inventory.inventory_quantity || 0) * entryUnitCost;

    const reportRow = {
      // Customer & Product Information
      customer_code: customerCode,
      customer_name: customerName,
      product_code: product?.product_code || '',
      product_name: product?.product_name || '',
      product_category: product?.category?.category_name || '',
      product_subcategory1: product?.subcategory1?.subcategory_name || '',
      product_subcategory2: product?.subcategory2?.subcategory_name || '',

      // Packaging Information
      packing_type: getPackagingType(entryProduct?.packaging_type),
      packing_condition: getPackagingCondition(entryProduct?.packaging_status),

      // Entry Order Information
      entry_order_number: entryOrder?.entry_order_no || '',
      entry_order_date: entryOrder?.entry_date_time ? new Date(entryOrder.entry_date_time).toISOString().split('T')[0] : '',
      entry_order_guia: entryOrder?.guia_remision || '',
      entry_order_transport_guia: entryOrder?.transport_company_guide || '',
      entry_order_quantity: parseFloat(inventory.inventory_quantity || 0),
      entry_order_unit_cost: entryUnitCost.toFixed(2),
      entry_order_total_cost: entryTotalCost.toFixed(2),
      entry_order_currency: entryOrder?.currency || 'USD',
      entry_order_supplier_code: entryOrder?.supplier?.supplier_code || '',
      entry_order_supplier_name: entryOrder?.supplier?.name || '',
      entry_order_customer_code: customerCode,
      entry_order_customer_name: customerName,

      // Dispatch Order Information (empty for unallocated)
      dispatch_order_number: '',
      dispatch_order_date: '',
      dispatch_order_guia: '',
      dispatch_order_transport_guia: '',
      dispatch_order_quantity: 0,
      dispatch_order_unit_cost: '0.00',
      dispatch_order_total_cost: '0.00',
      dispatch_order_currency: '',
      dispatch_order_customer_code: '',
      dispatch_order_customer_name: '',
      dispatch_order_customer_address: '',

      // TSL Personnel Information
      order_receiver_from_tsl: entryOrder?.created_by ?
        `${entryOrder.created_by.first_name || ''} ${entryOrder.created_by.last_name || ''}`.trim() : '',
      order_dispatcher_from_tsl: '',

      // Additional Information
      lot_number: entryProduct?.lot_number || '',
      expiry_date: entryProduct?.expiry_date ? new Date(entryProduct.expiry_date).toISOString().split('T')[0] : '',
      warehouse_location: inventory?.cell ?
        `${inventory.cell.warehouse?.name || ''} - Row ${inventory.cell.row_number}.Bay ${String(inventory.cell.bay_number).padStart(2, '0')}.Pos ${String(inventory.cell.position_number).padStart(2, '0')}` : '',
      quality_status: inventory?.quality_control_status || '',
      remarks: entryOrder?.remarks || '',
      observations: entryOrder?.observation || '',

      // Transaction metadata
      transaction_type: 'IN_STOCK',
      entry_to_dispatch_days: null
    };

    reportData.push(reportRow);
  }

  return reportData;
}

/**
 * Get unallocated inventory (entries without dispatches)
 */
async function getUnallocatedInventory(filters, userContext) {
  let whereConditions = {
    current_quantity: { gt: 0 },
    status: 'ACTIVE'
  };

  // Apply similar filters as main query
  if (filters.date_from || filters.date_to) {
    const dateFilter = {};
    if (filters.date_from) {
      dateFilter.gte = new Date(filters.date_from);
    }
    if (filters.date_to) {
      const endDate = new Date(filters.date_to);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }

    whereConditions.entry_order_product = {
      entry_order: {
        entry_date_time: dateFilter
      }
    };
  }

  // Product filtering
  if (filters.product_name || filters.product_code) {
    const productFilter = {};
    if (filters.product_name) {
      productFilter.product_name = { contains: filters.product_name, mode: 'insensitive' };
    }
    if (filters.product_code) {
      productFilter.product_code = { contains: filters.product_code, mode: 'insensitive' };
    }

    if (!whereConditions.entry_order_product) {
      whereConditions.entry_order_product = {};
    }
    whereConditions.entry_order_product.product = productFilter;
  }

  // Role-based filtering
  if (userContext.userRole === 'CLIENT') {
    if (!whereConditions.entry_order_product) {
      whereConditions.entry_order_product = {};
    }
    whereConditions.entry_order_product.entry_order = {
      OR: [
        { client_id: userContext.userId },
        { customer_id: userContext.userId }
      ]
    };
  }

  const inventory = await prisma.inventoryAllocation.findMany({
    where: whereConditions,
    include: {
      entry_order_product: {
        include: {
          product: {
            include: {
              category: true,
              subcategory1: true,
              subcategory2: true
            }
          },
          entry_order: {
            include: {
              supplier: true,
              client: true,
              customer: true,
              created_by: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true
                }
              }
            }
          }
        }
      },
      cell: {
        include: {
          warehouse: true
        }
      },
      departureAllocations: true
    }
  });

  // Filter out items that have departure allocations
  return inventory.filter(inv => !inv.departureAllocations || inv.departureAllocations.length === 0);
}

/**
 * Calculate summary statistics for the report
 */
function calculateSummary(reportData) {
  const summary = {
    total_transactions: reportData.length,
    dispatched_transactions: reportData.filter(r => r.transaction_type === 'DISPATCHED').length,
    in_stock_transactions: reportData.filter(r => r.transaction_type === 'IN_STOCK').length,
    total_entry_quantity: 0,
    total_dispatch_quantity: 0,
    total_entry_value: 0,
    total_dispatch_value: 0,
    unique_products: new Set(),
    unique_customers: new Set(),
    unique_suppliers: new Set(),
    average_days_to_dispatch: 0
  };

  let dispatchDaysSum = 0;
  let dispatchDaysCount = 0;

  for (const row of reportData) {
    summary.total_entry_quantity += parseFloat(row.entry_order_quantity || 0);
    summary.total_dispatch_quantity += parseFloat(row.dispatch_order_quantity || 0);
    summary.total_entry_value += parseFloat(row.entry_order_total_cost || 0);
    summary.total_dispatch_value += parseFloat(row.dispatch_order_total_cost || 0);

    if (row.product_code) summary.unique_products.add(row.product_code);
    if (row.customer_code) summary.unique_customers.add(row.customer_code);
    if (row.entry_order_supplier_code) summary.unique_suppliers.add(row.entry_order_supplier_code);

    if (row.entry_to_dispatch_days !== null && row.entry_to_dispatch_days >= 0) {
      dispatchDaysSum += row.entry_to_dispatch_days;
      dispatchDaysCount++;
    }
  }

  summary.unique_products = summary.unique_products.size;
  summary.unique_customers = summary.unique_customers.size;
  summary.unique_suppliers = summary.unique_suppliers.size;
  summary.average_days_to_dispatch = dispatchDaysCount > 0 ?
    (dispatchDaysSum / dispatchDaysCount).toFixed(1) : 0;

  summary.total_entry_value = summary.total_entry_value.toFixed(2);
  summary.total_dispatch_value = summary.total_dispatch_value.toFixed(2);

  return summary;
}

/**
 * Helper function to map packaging type
 */
function getPackagingType(type) {
  const packagingTypes = {
    'PALET': 'Pallet',
    'BOX': 'Box',
    'SACK': 'Sack',
    'UNIT': 'Unit',
    'PACK': 'Pack',
    'BARRELS': 'Barrels',
    'BUNDLE': 'Bundle',
    'OTHER': 'Other'
  };
  return packagingTypes[type] || type || '';
}

/**
 * Helper function to map packaging condition
 */
function getPackagingCondition(status) {
  const packagingStatus = {
    'NORMAL': 'Normal',
    'PARTIALLY_DAMAGED': 'Partially Damaged',
    'DAMAGED': 'Damaged'
  };
  return packagingStatus[status] || status || '';
}

module.exports = {
  generateMasterReport
};