const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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
        // Source allocation links to entry
        source_allocation: {
          include: {
            // Entry order product details
            entry_order_product: {
              include: {
                // Supplier for this product
                supplier: true,
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
                    creator: {
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
                reviewer: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true
                  }
                },
                creator: {
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
        { source_allocation: { entry_order_product: { entry_order: { entry_date_time: 'desc' } } } }
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
      whereConditions.source_allocation = {
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

    if (!whereConditions.source_allocation) {
      whereConditions.source_allocation = {};
    }
    whereConditions.source_allocation.entry_order_product = {
      ...whereConditions.source_allocation.entry_order_product,
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

    if (!whereConditions.source_allocation) {
      whereConditions.source_allocation = {};
    }
    if (!whereConditions.source_allocation.entry_order_product) {
      whereConditions.source_allocation.entry_order_product = {};
    }
    whereConditions.source_allocation.entry_order_product.entry_order = {
      ...whereConditions.source_allocation.entry_order_product.entry_order,
      supplier: supplierFilter
    };
  }

  // Role-based filtering
  if (userContext.userRole === 'CLIENT') {
    const clientFilter = {
      OR: [
        {
          source_allocation: {
            entry_order_product: {
              entry_order: {
                client_id: userContext.userId
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
    const invAllocation = transaction.source_allocation;
    const entryProduct = invAllocation?.entry_order_product;
    const entryOrder = entryProduct?.entry_order;
    const depProduct = transaction.departure_order_product;
    const depOrder = depProduct?.departure_order;
    const product = entryProduct?.product;

    // Determine customer information
    let customerCode = '';
    let customerName = '';

    // For dispatch customer
    if (depOrder?.client) {
      customerCode = depOrder.client.client_code || '';
      customerName = depOrder.client.company_name || `${depOrder.client.first_names || ''} ${depOrder.client.last_name || ''}`.trim();
    } else if (depOrder?.customer) {
      customerCode = depOrder.customer.customer_code || '';
      customerName = depOrder.customer.name || '';
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
      product_name: product?.name || '',
      product_category: product?.category?.name || '',
      product_subcategory1: product?.subcategory1?.name || '',
      product_subcategory2: product?.subcategory2?.name || '',

      // ✅ NEW: Position / Pallet field (ADDED - Missing field #1)
      position_pallet: invAllocation?.cell ?
        `${invAllocation.cell.row}.${String(invAllocation.cell.bay).padStart(2, '0')}.${String(invAllocation.cell.position).padStart(2, '0')}` : '',

      // Packaging Information (keeping only packing_condition, REMOVED packing_type)
      packing_condition: getPackagingCondition(invAllocation?.product_status),

      // Entry Order Information
      entry_order_number: entryOrder?.entry_order_no || '',
      entry_order_date: entryOrder?.entry_date_time ? new Date(entryOrder.entry_date_time).toISOString().split('T')[0] : '',
      entry_order_guide_number: entryProduct?.guide_number || entryOrder?.guide_number || '',
      entry_order_quantity: parseFloat(invAllocation?.inventory_quantity || 0),
      entry_order_packages: parseFloat(invAllocation?.package_quantity || 0),
      entry_order_weight: parseFloat(invAllocation?.weight_kg || 0),
      entry_order_unit_cost: entryUnitCost.toFixed(2),
      entry_order_total_cost: entryTotalCost.toFixed(2),
      entry_order_supplier_code: entryProduct?.supplier?.supplier_code || '',
      entry_order_supplier_name: entryProduct?.supplier?.company_name || entryProduct?.supplier?.name || '',
      entry_order_customer_code: entryCustomerCode,
      entry_order_customer_name: entryCustomerName,

      // Dispatch Order Information
      dispatch_order_number: depOrder?.departure_order_no || '',
      dispatch_order_date: depOrder?.departure_date_time ? new Date(depOrder.departure_date_time).toISOString().split('T')[0] : '',
      dispatch_document_number: depOrder?.dispatch_document_number || '',
      dispatch_order_quantity: parseFloat(transaction.allocated_quantity || 0),
      dispatch_order_packages: parseFloat(transaction.allocated_packages || 0),
      dispatch_order_weight: parseFloat(transaction.allocated_weight || 0),
      dispatch_order_unit_cost: dispatchUnitCost.toFixed(2),
      dispatch_order_total_cost: dispatchTotalCost.toFixed(2),

      // ✅ NEW: Order Out Customer fields (ADDED - Missing fields #2 and #3)
      order_out_customer_code: customerCode,
      order_out_customer_name: customerName,

      // TSL Personnel Information
      order_receiver_from_tsl: entryOrder?.creator ?
        `${entryOrder.creator.first_name || ''} ${entryOrder.creator.last_name || ''}`.trim() : '',
      order_dispatcher_from_tsl: depOrder?.reviewer ?
        `${depOrder.reviewer.first_name || ''} ${depOrder.reviewer.last_name || ''}`.trim() :
        (depOrder?.creator ? `${depOrder.creator.first_name || ''} ${depOrder.creator.last_name || ''}`.trim() : ''),

      // Additional Information
      lot_number: entryProduct?.lot_series || '',
      expiry_date: entryProduct?.expiration_date ? new Date(entryProduct.expiration_date).toISOString().split('T')[0] : '',
      manufacturing_date: entryProduct?.manufacturing_date ? new Date(entryProduct.manufacturing_date).toISOString().split('T')[0] : '',
      remarks: depOrder?.observation || entryOrder?.observation || ''

      // ✅ REMOVED: packing_type, warehouse_location, quality_status, transaction_type, entry_to_dispatch_days (5 fields removed)
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
      product_name: product?.name || '',
      product_category: product?.category?.name || '',
      product_subcategory1: product?.subcategory1?.name || '',
      product_subcategory2: product?.subcategory2?.name || '',

      // ✅ NEW: Position / Pallet field
      position_pallet: inventory?.cell ?
        `${inventory.cell.row}.${String(inventory.cell.bay).padStart(2, '0')}.${String(inventory.cell.position).padStart(2, '0')}` : '',

      // Packaging Information (keeping only packing_condition)
      packing_condition: getPackagingCondition(inventory?.product_status),

      // Entry Order Information
      entry_order_number: entryOrder?.entry_order_no || '',
      entry_order_date: entryOrder?.entry_date_time ? new Date(entryOrder.entry_date_time).toISOString().split('T')[0] : '',
      entry_order_guide_number: entryProduct?.guide_number || entryOrder?.guide_number || '',
      entry_order_quantity: parseFloat(inventory.inventory_quantity || 0),
      entry_order_packages: parseFloat(inventory.package_quantity || 0),
      entry_order_weight: parseFloat(inventory.weight_kg || 0),
      entry_order_unit_cost: entryUnitCost.toFixed(2),
      entry_order_total_cost: entryTotalCost.toFixed(2),
      entry_order_supplier_code: entryProduct?.supplier?.supplier_code || '',
      entry_order_supplier_name: entryProduct?.supplier?.company_name || entryProduct?.supplier?.name || '',
      entry_order_customer_code: customerCode,
      entry_order_customer_name: customerName,

      // Dispatch Order Information (empty for unallocated)
      dispatch_order_number: '',
      dispatch_order_date: '',
      dispatch_document_number: '',
      dispatch_order_quantity: 0,
      dispatch_order_packages: 0,
      dispatch_order_weight: 0,
      dispatch_order_unit_cost: '0.00',
      dispatch_order_total_cost: '0.00',

      // ✅ NEW: Order Out Customer fields (empty for unallocated)
      order_out_customer_code: '',
      order_out_customer_name: '',

      // TSL Personnel Information
      order_receiver_from_tsl: entryOrder?.creator ?
        `${entryOrder.creator.first_name || ''} ${entryOrder.creator.last_name || ''}`.trim() : '',
      order_dispatcher_from_tsl: '',

      // Additional Information
      lot_number: entryProduct?.lot_series || '',
      expiry_date: entryProduct?.expiration_date ? new Date(entryProduct.expiration_date).toISOString().split('T')[0] : '',
      manufacturing_date: entryProduct?.manufacturing_date ? new Date(entryProduct.manufacturing_date).toISOString().split('T')[0] : '',
      remarks: entryOrder?.observation || ''

      // ✅ REMOVED: packing_type, warehouse_location, quality_status, transaction_type, entry_to_dispatch_days
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
    status: 'ACTIVE',
    inventory: {
      some: {
        current_quantity: { gt: 0 }
      }
    }
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
      client_id: userContext.userId
    };
  }

  const inventory = await prisma.inventoryAllocation.findMany({
    where: whereConditions,
    include: {
      entry_order_product: {
        include: {
          supplier: true,
          product: {
            include: {
              category: true,
              subcategory1: true,
              subcategory2: true
            }
          },
          entry_order: {
            include: {
              client: true,
              creator: {
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
      inventory: true,
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

  for (const row of reportData) {
    summary.total_entry_quantity += parseFloat(row.entry_order_quantity || 0);
    summary.total_dispatch_quantity += parseFloat(row.dispatch_order_quantity || 0);
    summary.total_entry_value += parseFloat(row.entry_order_total_cost || 0);
    summary.total_dispatch_value += parseFloat(row.dispatch_order_total_cost || 0);

    if (row.product_code) summary.unique_products.add(row.product_code);
    if (row.customer_code) summary.unique_customers.add(row.customer_code);
    if (row.entry_order_supplier_code) summary.unique_suppliers.add(row.entry_order_supplier_code);
  }

  summary.unique_products = summary.unique_products.size;
  summary.unique_customers = summary.unique_customers.size;
  summary.unique_suppliers = summary.unique_suppliers.size;

  summary.total_entry_value = summary.total_entry_value.toFixed(2);
  summary.total_dispatch_value = summary.total_dispatch_value.toFixed(2);

  return summary;
}

/**
 * Helper function to map packaging condition based on ProductStatus enum
 * ProductStatus values: PAL_NORMAL, CAJ_NORMAL, etc. (30-37 normal, 40-47 damaged)
 */
function getPackagingCondition(status) {
  if (!status) return '';

  // Check if it's a normal status (contains NORMAL)
  if (status.includes('NORMAL')) {
    return 'Normal';
  }
  // Check if it's a damaged status (contains DANADA or DANADO)
  if (status.includes('DANADA') || status.includes('DANADO')) {
    return 'Dañado'; // Spanish for damaged
  }

  return status || '';
}

module.exports = {
  generateMasterReport
};