const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Generate comprehensive warehouse report with filtering capabilities
 * @param {Object} filters - Filter parameters
 * @param {string} filters.date_from - Start date (ISO string)
 * @param {string} filters.date_to - End date (ISO string)
 * @param {string} filters.customer_name - Customer name filter
 * @param {string} filters.customer_code - Customer code filter
 * @param {string} filters.product_name - Product name filter
 * @param {string} filters.product_code - Product code filter
 * @param {string} filters.warehouse_id - Warehouse ID filter
 * @param {string} filters.quality_status - Quality status filter
 * @param {string} filters.include_depleted - Include depleted inventory (default: true)
 * @param {Object} userContext - User context for role-based filtering
 * @returns {Object} Warehouse report data
 */
async function generateWarehouseReport(filters = {}, userContext = {}) {
  const startTime = Date.now();
  console.log(`📊 WAREHOUSE REPORT: Starting report generation at ${new Date().toISOString()}`);

  try {
    const { userId, userRole } = userContext;

    // ✅ Build where clause for inventory allocations
    // Default to including depleted inventory unless explicitly set to false
    const includeDepleted = filters.include_depleted !== 'false' && filters.include_depleted !== false;

    const whereClause = {
      status: "ACTIVE"
    };

    // ✅ Filter by inventory quantity (include depleted if requested)
    if (!includeDepleted) {
      whereClause.inventory = {
        some: {
          current_quantity: { gt: 0 }
        }
      };
    } else {
      // Include all inventory (depleted and active)
      whereClause.inventory = {
        some: {}
      };
    }

    // ✅ Date range filtering
    if (filters.date_from || filters.date_to) {
      whereClause.entry_order_product = {
        entry_order: {}
      };
      
      if (filters.date_from) {
        whereClause.entry_order_product.entry_order.entry_date_time = {
          gte: new Date(filters.date_from)
        };
      }
      
      if (filters.date_to) {
        whereClause.entry_order_product.entry_order.entry_date_time = {
          ...whereClause.entry_order_product.entry_order.entry_date_time,
          lte: new Date(filters.date_to)
        };
      }
    }



    // ✅ Product filtering
    if (filters.product_name || filters.product_code) {
      whereClause.entry_order_product = {
        ...whereClause.entry_order_product,
        product: {}
      };
      
      if (filters.product_name) {
        whereClause.entry_order_product.product.name = {
          contains: filters.product_name,
          mode: 'insensitive'
        };
      }
      
      if (filters.product_code) {
        whereClause.entry_order_product.product.product_code = {
          contains: filters.product_code,
          mode: 'insensitive'
        };
      }
    }

    // ✅ Warehouse filtering
    if (filters.warehouse_id) {
      whereClause.cell = {
        warehouse_id: filters.warehouse_id
      };
    }

    // ✅ Quality status filtering
    if (filters.quality_status) {
      whereClause.quality_status = filters.quality_status;
    }

    // ✅ Customer filtering (fixed to use correct database relationships)
    if (filters.customer_name || filters.customer_code) {
      whereClause.entry_order_product = {
        ...whereClause.entry_order_product,
        entry_order: {
          ...whereClause.entry_order_product?.entry_order,
          OR: [
            // Filter by entry order creator (if they are a client)
            filters.customer_name ? {
              creator: {
                role: { name: 'CLIENT' },
                OR: [
                  { first_name: { contains: filters.customer_name, mode: 'insensitive' } },
                  { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
                ]
              }
            } : {},
            // Filter by client assignments to products
            filters.customer_name ? {
              products: {
                some: {
                  product: {
                    clientAssignments: {
                      some: {
                        client: {
                          OR: [
                            { company_name: { contains: filters.customer_name, mode: 'insensitive' } },
                            { first_names: { contains: filters.customer_name, mode: 'insensitive' } },
                            { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            } : {}
          ].filter(condition => Object.keys(condition).length > 0)
        }
      };
    }

    // ✅ Role-based access control
    const isClientUser = userRole && !['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'].includes(userRole);
    
    if (isClientUser && userId) {
      try {
        // Get user's client assignments
        const userWithClients = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            clientUserAccounts: {
              where: { is_active: true },
              select: { client_id: true }
            }
          }
        });
        
        if (userWithClients?.clientUserAccounts?.length > 0) {
          const userClientIds = userWithClients.clientUserAccounts.map(acc => acc.client_id);
          
          // Filter to only show inventory assigned to user's clients
          whereClause.cell = {
            ...whereClause.cell,
            clientCellAssignments: {
              some: {
                is_active: true,
                client_id: { in: userClientIds }
              }
            }
          };
        } else {
          return {
            success: true,
            message: "No client assignments found for user",
            data: [],
            summary: {
              total_records: 0,
              total_quantity: 0,
              total_weight: 0,
              warehouses_involved: 0,
              products_involved: 0,
              customers_involved: 0
            },
            filters_applied: filters,
            user_role: userRole,
            is_client_filtered: true
          };
        }
      } catch (error) {
        console.error("Error fetching user client assignments:", error);
        return {
          success: false,
          message: "Error fetching user client assignments",
          error: error.message
        };
      }
    }

    // ✅ Fetch inventory data with comprehensive includes
    const inventoryData = await prisma.inventoryAllocation.findMany({
      where: whereClause,
      include: {
        inventory: {
          // Only filter by current_quantity if depleted inventory is excluded
          where: includeDepleted ? {} : {
            current_quantity: { gt: 0 }
          },
          select: {
            inventory_id: true,
            current_quantity: true,
            current_package_quantity: true,
            current_weight: true,
            current_volume: true,
            status: true,
            quality_status: true,
            created_at: true,
            last_updated: true
          }
        },
        entry_order_product: {
          select: {
            product_id: true,
            expiration_date: true,
            lot_series: true,
            manufacturing_date: true,
            presentation: true,
                            entry_order: {
                  select: {
                    entry_order_id: true,
                    entry_order_no: true,
                    entry_date_time: true
                  }
                },
            product: {
              select: {
                product_id: true,
                product_code: true,
                name: true,
                manufacturer: true
              }
            }
          }
        },
        cell: {
          select: {
            id: true,
            row: true,
            bay: true,
            position: true,
            cell_role: true,
            status: true,
            warehouse: {
              select: {
                warehouse_id: true,
                name: true,
                location: true,
                capacity: true,
                max_occupancy: true
              }
            },
            clientCellAssignments: {
              where: { is_active: true },
              select: {
                client_id: true,
                priority: true,
                max_capacity: true,
                notes: true,
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { entry_order_product: { entry_order: { entry_date_time: "asc" } } },
        { entry_order_product: { product: { product_code: "asc" } } },
        { cell: { warehouse: { name: "asc" } } }
      ]
    });

    console.log(`📦 Retrieved ${inventoryData.length} inventory allocations for report`);

    // ✅ Get all warehouse storage cells for space calculation (exclude passages)
    const warehouseCells = await prisma.warehouseCell.findMany({
      where: {
        is_passage: false // Only count storage cells, not passages
      },
      select: {
        id: true,
        status: true,
        warehouse_id: true,
        warehouse: {
          select: {
            warehouse_id: true,
            name: true
          }
        }
      }
    });

    // ✅ Transform data into client-product-position hierarchy
    const clientProductMap = new Map();
    
    inventoryData.forEach(allocation => {
      const inventory = allocation.inventory[0];
      if (!inventory) return;

      const product = allocation.entry_order_product.product;
      const warehouse = allocation.cell.warehouse;
      const clientAssignments = allocation.cell.clientCellAssignments;

      // Calculate expiry information
      const expiryDate = allocation.entry_order_product.expiration_date;
      const daysToExpiry = expiryDate ? 
        Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
      
      // Determine category based on quality status and cell role
      const category = allocation.quality_status || allocation.cell.cell_role || 'STANDARD';
      
      // Calculate position information
      const position = `${allocation.cell.row}.${String(allocation.cell.bay).padStart(2, '0')}.${String(allocation.cell.position).padStart(2, '0')}`;

      // Create position data
      const positionData = {
        allocation_id: allocation.allocation_id,
        inventory_id: inventory.inventory_id,
        cell_id: allocation.cell.id,
        position: position,
        cell_role: allocation.cell.cell_role,
        cell_status: allocation.cell.status,
        quantity_units: inventory.current_quantity,
        package_quantity: inventory.current_package_quantity,
        weight_kg: parseFloat(inventory.current_weight || 0),
        volume_m3: inventory.current_volume ? parseFloat(inventory.current_volume) : null,
        category: category,
        quality_status: allocation.quality_status,
        inventory_status: inventory.status,
        lot_series: allocation.entry_order_product.lot_series,
        manufacturing_date: allocation.entry_order_product.manufacturing_date,
        expiration_date: expiryDate,
        days_to_expiry: daysToExpiry,
        presentation: allocation.entry_order_product.presentation,
        product_status: allocation.product_status,
        is_near_expiry: daysToExpiry !== null && daysToExpiry <= 30,
        is_urgent: daysToExpiry !== null && daysToExpiry <= 7,
        is_expired: daysToExpiry !== null && daysToExpiry < 0,
        entry_order_id: allocation.entry_order_product.entry_order.entry_order_id,
        entry_order_no: allocation.entry_order_product.entry_order.entry_order_no,
        entry_date: allocation.entry_order_product.entry_order.entry_date_time,
        created_at: inventory.created_at,
        last_updated: inventory.last_updated,
        warehouse_id: warehouse.warehouse_id,
        warehouse_name: warehouse.name,
        warehouse_location: warehouse.location
      };

      // Process each client assignment for this cell
      if (clientAssignments && clientAssignments.length > 0) {
        clientAssignments.forEach(assignment => {
          const client = assignment.client;
          const clientName = client.company_name || `${client.first_names || ''} ${client.last_name || ''}`.trim();
          const clientKey = `${client.client_id}-${clientName}`;
          const productKey = `${product.product_id}-${product.product_code}`;

          if (!clientProductMap.has(clientKey)) {
            clientProductMap.set(clientKey, {
              client_id: client.client_id,
              client_name: clientName,
              client_type: client.client_type,
              client_email: client.email,
              products: new Map(),
              total_positions: 0,
              total_quantity: 0,
              total_weight: 0,
              total_volume: 0
            });
          }

          const clientData = clientProductMap.get(clientKey);
          
          if (!clientData.products.has(productKey)) {
            clientData.products.set(productKey, {
              product_id: product.product_id,
              product_code: product.product_code,
              product_name: product.name,
              manufacturer: product.manufacturer,
              positions: [],
              unique_locations: new Set(),
              location_count: 0,
              total_quantity: 0,
              total_weight: 0,
              total_volume: 0
            });
          }

          const productData = clientData.products.get(productKey);
          productData.positions.push(positionData);
          productData.unique_locations.add(positionData.cell_id);
          productData.location_count = productData.unique_locations.size;
          productData.total_quantity += positionData.quantity_units;
          productData.total_weight += positionData.weight_kg;
          productData.total_volume += positionData.volume_m3 || 0;

          // Update client totals
          clientData.total_positions++;
          clientData.total_quantity += positionData.quantity_units;
          clientData.total_weight += positionData.weight_kg;
          clientData.total_volume += positionData.volume_m3 || 0;
        });
      } else {
        // Handle inventory without client assignments (show as "Unassigned")
        const clientKey = "unassigned-client";
        const productKey = `${product.product_id}-${product.product_code}`;

        if (!clientProductMap.has(clientKey)) {
          clientProductMap.set(clientKey, {
            client_id: null,
            client_name: "Unassigned",
            client_type: null,
            client_email: null,
            products: new Map(),
            total_positions: 0,
            total_quantity: 0,
            total_weight: 0,
            total_volume: 0
          });
        }

        const clientData = clientProductMap.get(clientKey);
        
        if (!clientData.products.has(productKey)) {
          clientData.products.set(productKey, {
            product_id: product.product_id,
            product_code: product.product_code,
            product_name: product.name,
            manufacturer: product.manufacturer,
            positions: [],
            unique_locations: new Set(),
            location_count: 0,
            total_quantity: 0,
            total_weight: 0,
            total_volume: 0
          });
        }

        const productData = clientData.products.get(productKey);
        productData.positions.push(positionData);
        productData.unique_locations.add(positionData.cell_id);
        productData.location_count = productData.unique_locations.size;
        productData.total_quantity += positionData.quantity_units;
        productData.total_weight += positionData.weight_kg;
        productData.total_volume += positionData.volume_m3 || 0;

        // Update client totals
        clientData.total_positions++;
        clientData.total_quantity += positionData.quantity_units;
        clientData.total_weight += positionData.weight_kg;
        clientData.total_volume += positionData.volume_m3 || 0;
      }
    });

    // Convert Map to structured report data
    const reportData = Array.from(clientProductMap.values()).map(clientData => ({
      ...clientData,
      products: Array.from(clientData.products.values()).map(product => ({
        ...product,
        unique_locations: undefined  // Remove Set from output
      }))
    }));

    // ✅ Calculate warehouse space statistics
    const occupiedCells = new Set();
    inventoryData.forEach(allocation => {
      if (allocation.inventory[0]) {
        occupiedCells.add(allocation.cell.id);
      }
    });

    const warehouseSpaceStats = warehouseCells.reduce((acc, cell) => {
      const warehouseKey = cell.warehouse.name;
      if (!acc[warehouseKey]) {
        acc[warehouseKey] = { total: 0, occupied: 0, vacant: 0 };
      }
      acc[warehouseKey].total++;
      if (occupiedCells.has(cell.id)) {
        acc[warehouseKey].occupied++;
      } else {
        acc[warehouseKey].vacant++;
      }
      return acc;
    }, {});

    // ✅ Calculate summary statistics for hierarchical structure
    const summary = {
      total_clients: reportData.length,
      total_products: reportData.reduce((sum, client) => sum + client.products.length, 0),
      total_positions: reportData.reduce((sum, client) => sum + client.total_positions, 0),
      total_quantity: reportData.reduce((sum, client) => sum + client.total_quantity, 0),
      total_weight: reportData.reduce((sum, client) => sum + client.total_weight, 0),
      total_volume: reportData.reduce((sum, client) => sum + client.total_volume, 0),
      
      // Warehouse space information
      warehouse_space: warehouseSpaceStats,
      total_warehouse_cells: warehouseCells.length,
      total_occupied_cells: occupiedCells.size,
      total_vacant_cells: warehouseCells.length - occupiedCells.size,

      // Client breakdown
      client_breakdown: reportData.map(client => ({
        client_id: client.client_id,
        client_name: client.client_name,
        client_type: client.client_type,
        product_count: client.products.length,
        position_count: client.total_positions,
        total_quantity: client.total_quantity,
        total_weight: client.total_weight,
        total_volume: client.total_volume
      })),

      // Product distribution across clients
      product_distribution: reportData.reduce((acc, client) => {
        client.products.forEach(product => {
          const key = `${product.product_code}-${product.product_name}`;
          if (!acc[key]) {
            acc[key] = {
              product_id: product.product_id,
              product_code: product.product_code,
              product_name: product.product_name,
              manufacturer: product.manufacturer,
              clients: [],
              total_positions: 0,
              total_quantity: 0,
              total_weight: 0
            };
          }
          acc[key].clients.push({
            client_id: client.client_id,
            client_name: client.client_name,
            position_count: product.position_count,
            quantity: product.total_quantity,
            weight: product.total_weight
          });
          acc[key].total_positions += product.position_count;
          acc[key].total_quantity += product.total_quantity;
          acc[key].total_weight += product.total_weight;
        });
        return acc;
      }, {}),

      // Initialize breakdown objects
      warehouse_breakdown: {},
      quality_status_breakdown: {},
      category_breakdown: {},
      urgency_breakdown: { expired: 0, urgent: 0, near_expiry: 0, normal: 0 }
    };

    // Calculate detailed breakdowns from position data
    reportData.forEach(client => {
      client.products.forEach(product => {
        product.positions.forEach(position => {
          // Warehouse breakdown
          const warehouseKey = `${position.warehouse_name} (${position.warehouse_id})`;
          if (!summary.warehouse_breakdown[warehouseKey]) {
            summary.warehouse_breakdown[warehouseKey] = { positions: 0, quantity: 0, weight: 0 };
          }
          summary.warehouse_breakdown[warehouseKey].positions += 1;
          summary.warehouse_breakdown[warehouseKey].quantity += position.quantity_units;
          summary.warehouse_breakdown[warehouseKey].weight += position.weight_kg;

          // Quality status breakdown
          if (!summary.quality_status_breakdown[position.quality_status]) {
            summary.quality_status_breakdown[position.quality_status] = 0;
          }
          summary.quality_status_breakdown[position.quality_status] += 1;

          // Category breakdown
          if (!summary.category_breakdown[position.category]) {
            summary.category_breakdown[position.category] = 0;
          }
          summary.category_breakdown[position.category] += 1;

          // Urgency breakdown
          if (position.is_expired) {
            summary.urgency_breakdown.expired += 1;
          } else if (position.is_urgent) {
            summary.urgency_breakdown.urgent += 1;
          } else if (position.is_near_expiry) {
            summary.urgency_breakdown.near_expiry += 1;
          } else {
            summary.urgency_breakdown.normal += 1;
          }
        });
      });
    });

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`✅ WAREHOUSE REPORT COMPLETE: Generated hierarchical report with ${reportData.length} clients in ${duration}ms`);

    return {
      success: true,
      message: "Warehouse report generated successfully with client-product-position hierarchy",
      data: reportData,
      summary,
      filters_applied: filters,
      user_role: userRole,
      is_client_filtered: isClientUser,
      report_generated_at: new Date().toISOString(),
      processing_time_ms: duration
    };

  } catch (error) {
    console.error("Error generating warehouse report:", error);
    return {
      success: false,
      message: "Error generating warehouse report",
      error: error.message
    };
  }
}

async function generateProductCategoryReport(filters, userContext) {
  const startTime = Date.now();
  
  try {
    console.log("📊 Starting product category report generation...");

    // Build base query conditions
    const whereConditions = {};
    
    // Date range filtering
    if (filters.date_from || filters.date_to) {
      const dateFilter = {};
      if (filters.date_from) dateFilter.gte = new Date(filters.date_from);
      if (filters.date_to) dateFilter.lte = new Date(filters.date_to);
      whereConditions.allocated_at = dateFilter;
    }

    // ✅ Customer filtering (fixed to use correct database relationships)
    if (filters.customer_name || filters.customer_code) {
      whereConditions.entry_order_product = {
        entry_order: {
          OR: [
            // Filter by entry order creator (if they are a client)
            filters.customer_name ? {
              creator: {
                role: { name: 'CLIENT' },
                OR: [
                  { first_name: { contains: filters.customer_name, mode: 'insensitive' } },
                  { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
                ]
              }
            } : {},
            // Filter by client assignments to products
            filters.customer_name ? {
              products: {
                some: {
                  product: {
                    clientAssignments: {
                      some: {
                        client: {
                          OR: [
                            { company_name: { contains: filters.customer_name, mode: 'insensitive' } },
                            { first_names: { contains: filters.customer_name, mode: 'insensitive' } },
                            { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
                          ]
                        }
                      }
                    }
                  }
                }
              }
            } : {}
          ].filter(condition => Object.keys(condition).length > 0)
        }
      };
    }

    // Product filtering
    if (filters.product_name || filters.product_code) {
      whereConditions.entry_order_product = {
        ...whereConditions.entry_order_product,
        product: {
          OR: [
            filters.product_name ? { name: { contains: filters.product_name, mode: 'insensitive' } } : {},
            filters.product_code ? { product_code: { contains: filters.product_code, mode: 'insensitive' } } : {}
          ].filter(condition => Object.keys(condition).length > 0)
        }
      };
    }

    // Role-based access control
    let clientFilter = {};
    if (userContext.userRole === 'CLIENT') {
      if (userContext.client_id) {
        clientFilter = {
          entry_order_product: {
            entry_order: {
              client_id: userContext.client_id,
              // For non-primary users, also filter by created_by
              ...(userContext.is_primary_user ? {} : { created_by: userContext.userId })
            }
          }
        };
      } else {
        // Fallback: filter by created_by if no client_id
        clientFilter = {
          entry_order_product: {
            entry_order: {
              created_by: userContext.userId
            }
          }
        };
      }
    } else if (userContext.userRole === 'WAREHOUSE_ASSISTANT') {
      const clientAssignments = await prisma.clientProductAssignment.findMany({
        where: { user_id: userContext.userId },
        select: { client_id: true }
      });
      
      if (clientAssignments.length > 0) {
        clientFilter = {
          entry_order_product: {
            entry_order: {
              client_id: { in: clientAssignments.map(ca => ca.client_id) }
            }
          }
        };
      }
    }

    // Combine all conditions
    const finalWhere = {
      ...whereConditions,
      ...clientFilter
    };

    // Fetch inventory allocations for product category analysis
    const inventoryAllocations = await prisma.inventoryAllocation.findMany({
      where: finalWhere,
      include: {
        entry_order_product: {
          include: {
            product: {
              include: {
                category: true,
                subcategory1: true,
                subcategory2: true,
                clientAssignments: {
                  where: { is_active: true },
                  select: {
                    client_id: true,
                    client_product_code: true,
                    client: {
                      select: {
                        client_id: true,
                        client_type: true,
                        company_name: true,
                        first_names: true,
                        last_name: true,
                        email: true
                      }
                    }
                  }
                }
              }
            },
            entry_order: {
              include: {
                creator: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                    email: true,
                    role: { select: { name: true } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        allocated_at: 'desc'
      }
    });

    // Group data by product and quality status
    const productCategoryData = {};
    
    inventoryAllocations.forEach(allocation => {
      const product = allocation.entry_order_product.product;
      const productKey = `${product.product_code}-${product.name}`;
      
      if (!productCategoryData[productKey]) {
        // Get client information from product assignments or order creator
        const productClientAssignments = product.clientAssignments || [];
        const primaryClient = productClientAssignments[0]?.client;
        const orderCreator = allocation.entry_order_product.entry_order.creator;
        
        // Determine client information
        let clientName = null;
        let clientId = null;
        
        if (primaryClient) {
          clientName = primaryClient.company_name || `${primaryClient.first_names || ''} ${primaryClient.last_name || ''}`.trim();
          clientId = primaryClient.client_id;
        } else if (orderCreator?.role?.name === 'CLIENT') {
          clientName = `${orderCreator.first_name || ''} ${orderCreator.last_name || ''}`.trim();
          clientId = orderCreator.id;
        }

        productCategoryData[productKey] = {
          product_code: product.product_code,
          product_name: product.name,
          manufacturer: product.manufacturer,
          category: product.category?.name,
          subcategory1: product.subcategory1?.name,
          subcategory2: product.subcategory2?.name,
          client_id: clientId,
          client_name: clientName,
          customer_name: clientName, // For backward compatibility
          customer_code: clientId, // For backward compatibility
          approved_products: [],
          sample_products: [],
          quarantine_products: [],
          return_products: [],
          rejected_products: []
        };
      }

      const productData = {
        lot_number: allocation.entry_order_product.lot_series,
        quantity_units: allocation.inventory_quantity,
        entry_date: allocation.entry_order_product.entry_order.entry_date_time,
        expiration_date: allocation.entry_order_product.expiration_date
      };

      // Categorize by quality status
      switch (allocation.quality_status) {
        case 'APROBADO':
          productCategoryData[productKey].approved_products.push(productData);
          break;
        case 'CONTRAMUESTRAS':
          productCategoryData[productKey].sample_products.push(productData);
          break;
        case 'CUARENTENA':
          productCategoryData[productKey].quarantine_products.push(productData);
          break;
        case 'DEVOLUCIONES':
          productCategoryData[productKey].return_products.push(productData);
          break;
        case 'RECHAZADOS':
          productCategoryData[productKey].rejected_products.push(productData);
          break;
      }
    });

    // Convert to array format
    const reportData = Object.values(productCategoryData);

    // Generate summary statistics
    const summary = {
      total_products: reportData.length,
      total_approved: reportData.reduce((sum, item) => sum + item.approved_products.reduce((qty, prod) => qty + prod.quantity_units, 0), 0),
      total_samples: reportData.reduce((sum, item) => sum + item.sample_products.reduce((qty, prod) => qty + prod.quantity_units, 0), 0),
      total_quarantine: reportData.reduce((sum, item) => sum + item.quarantine_products.reduce((qty, prod) => qty + prod.quantity_units, 0), 0),
      total_returns: reportData.reduce((sum, item) => sum + item.return_products.reduce((qty, prod) => qty + prod.quantity_units, 0), 0),
      total_rejected: reportData.reduce((sum, item) => sum + item.rejected_products.reduce((qty, prod) => qty + prod.quantity_units, 0), 0),
      categories_breakdown: reportData.reduce((acc, item) => {
        if (item.category) {
          acc[item.category] = (acc[item.category] || 0) + 1;
        }
        return acc;
      }, {})
    };

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      message: "Product category report generated successfully",
      data: reportData,
      summary,
      filters_applied: filters,
      user_role: userContext.userRole,
      is_client_filtered: ['CLIENT', 'WAREHOUSE_ASSISTANT'].includes(userContext.userRole),
      report_generated_at: new Date().toISOString(),
      processing_time_ms: processingTime
    };

  } catch (error) {
    console.error("Error generating product category report:", error);
    return {
      success: false,
      message: "Error generating product category report",
      error: error.message
    };
  }
}

async function generateProductWiseReport(filters, userContext) {
  const startTime = Date.now();
  
  try {
    console.log("📊 Starting product-wise report generation...");

    // Build base query conditions for entry orders
    const entryWhereConditions = {};
    const departureWhereConditions = {};
    
    // Date range filtering
    if (filters.date_from || filters.date_to) {
      const dateFilter = {};
      if (filters.date_from) dateFilter.gte = new Date(filters.date_from);
      if (filters.date_to) dateFilter.lte = new Date(filters.date_to);
      entryWhereConditions.entry_order = { entry_date_time: dateFilter };
      departureWhereConditions.departure_order = { departure_date_time: dateFilter };
    }

    // ✅ Customer filtering (fixed to use correct database relationships)
    if (filters.customer_name || filters.customer_code) {
      // Entry order customer filtering
      const entryCustomerFilter = {
        OR: [
          // Filter by entry order creator (if they are a client)
          filters.customer_name ? {
            creator: {
              role: { name: 'CLIENT' },
              OR: [
                { first_name: { contains: filters.customer_name, mode: 'insensitive' } },
                { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
              ]
            }
          } : {},
          // Filter by client assignments to products  
          filters.customer_name ? {
            products: {
              some: {
                product: {
                  clientAssignments: {
                    some: {
                      client: {
                        OR: [
                          { company_name: { contains: filters.customer_name, mode: 'insensitive' } },
                          { first_names: { contains: filters.customer_name, mode: 'insensitive' } },
                          { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
                        ]
                      }
                    }
                  }
                }
              }
            }
          } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      };
      
      // Departure order customer filtering  
      const departureCustomerFilter = {
        OR: [
          // Filter by Customer model
          filters.customer_name ? {
            customer: { 
              name: { contains: filters.customer_name, mode: 'insensitive' } 
            }
          } : {},
          // Filter by Client model
          filters.customer_name ? {
            client: {
              OR: [
                { company_name: { contains: filters.customer_name, mode: 'insensitive' } },
                { first_names: { contains: filters.customer_name, mode: 'insensitive' } },
                { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
              ]
            }
          } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      };
      
      entryWhereConditions.entry_order = {
        ...entryWhereConditions.entry_order,
        ...entryCustomerFilter
      };
      departureWhereConditions.departure_order = {
        ...departureWhereConditions.departure_order,
        ...departureCustomerFilter
      };
    }

    // Product filtering
    if (filters.product_name || filters.product_code) {
      const productFilter = {
        OR: [
          filters.product_name ? { name: { contains: filters.product_name, mode: 'insensitive' } } : {},
          filters.product_code ? { product_code: { contains: filters.product_code, mode: 'insensitive' } } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      };
      entryWhereConditions.product = productFilter;
      departureWhereConditions.product = productFilter;
    }

    // Role-based access control
    let entryClientFilter = {};
    let departureClientFilter = {};
    
    if (userContext.userRole === 'CLIENT') {
      if (userContext.client_id) {
        entryClientFilter = {
          entry_order: {
            client_id: userContext.client_id,
            ...(userContext.is_primary_user ? {} : { created_by: userContext.userId })
          }
        };
        departureClientFilter = {
          departure_order: {
            client_id: userContext.client_id,
            ...(userContext.is_primary_user ? {} : { created_by: userContext.userId })
          }
        };
      } else {
        // Fallback: filter by created_by if no client_id
        entryClientFilter = {
          entry_order: {
            created_by: userContext.userId
          }
        };
        departureClientFilter = {
          departure_order: {
            created_by: userContext.userId
          }
        };
      }
    } else if (userContext.userRole === 'WAREHOUSE_ASSISTANT') {
      const clientAssignments = await prisma.clientProductAssignment.findMany({
        where: { user_id: userContext.userId },
        select: { client_id: true }
      });
      
      if (clientAssignments.length > 0) {
        entryClientFilter = {
          entry_order: {
            client_id: { in: clientAssignments.map(ca => ca.client_id) }
          }
        };
        departureClientFilter = {
          departure_order: {
            client_id: { in: clientAssignments.map(ca => ca.client_id) }
          }
        };
      }
    }

    // Combine all conditions
    const finalEntryWhere = {
      ...entryWhereConditions,
      ...entryClientFilter
    };

    const finalDepartureWhere = {
      ...departureWhereConditions,
      ...departureClientFilter
    };

    // Fetch stock in data (from entry orders)
    const stockInData = await prisma.entryOrderProduct.findMany({
      where: finalEntryWhere,
      include: {
        product: {
          include: {
            category: true,
            subcategory1: true,
            subcategory2: true,
            clientAssignments: {
              where: { is_active: true },
              select: {
                client_id: true,
                client_product_code: true,
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        entry_order: {
          include: {
            creator: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                role: { select: { name: true } }
              }
            }
          }
        },
        inventoryAllocations: {
          include: {
            cell: {
              include: {
                warehouse: true
              }
            }
          }
        }
      },
      orderBy: {
        entry_order: {
          entry_date_time: 'desc'
        }
      }
    });

    // Fetch stock out data (from departure orders)
    const stockOutData = await prisma.departureOrderProduct.findMany({
      where: finalDepartureWhere,
      include: {
        product: {
          include: {
            category: true,
            subcategory1: true,
            subcategory2: true,
            clientAssignments: {
              where: { is_active: true },
              select: {
                client_id: true,
                client_product_code: true,
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        departure_order: {
          include: {
            customer: true,
            client: true
          }
        },
        departureAllocations: {
          include: {
            source_allocation: {
              include: {
                entry_order_product: {
                  include: {
                    entry_order: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        departure_order: {
          departure_date_time: 'desc'
        }
      }
    });

    // Process stock in data
    const stockInProcessed = stockInData.map(item => {
      // Get client information from product assignments or order creator
      const productClientAssignments = item.product.clientAssignments || [];
      const primaryClient = productClientAssignments[0]?.client;
      const orderCreator = item.entry_order.creator;
      
      // Determine client information
      let clientName = null;
      let clientId = null;
      
      if (primaryClient) {
        clientName = primaryClient.company_name || `${primaryClient.first_names || ''} ${primaryClient.last_name || ''}`.trim();
        clientId = primaryClient.client_id;
      } else if (orderCreator?.role?.name === 'CLIENT') {
        clientName = `${orderCreator.first_name || ''} ${orderCreator.last_name || ''}`.trim();
        clientId = orderCreator.id;
      }

      return {
        type: 'STOCK_IN',
        product_code: item.product.product_code,
        product_name: item.product.name,
        manufacturer: item.product.manufacturer,
        category: item.product.category?.name,
        client_id: clientId,
        client_name: clientName,
        customer_name: clientName, // For backward compatibility
        customer_code: clientId, // For backward compatibility
        entry_order_code: item.entry_order.entry_order_no,
        entry_date: item.entry_order.entry_date_time,
        lot_number: item.lot_series,
        quantity_units: item.inventory_quantity,
        package_quantity: item.package_quantity,
        warehouse_quantity: item.inventoryAllocations.reduce((sum, alloc) => sum + (alloc.inventory_quantity || 0), 0),
        weight: item.weight_kg,
        volume: item.volume_m3,
        financial_value: parseFloat(item.insured_value || 0),
        expiration_date: item.expiration_date,
        warehouse_name: item.inventoryAllocations[0]?.cell?.warehouse?.name
      };
    });

    // Process stock out data
    const stockOutProcessed = stockOutData.map(item => {
      // Get client information from departure order or product assignments
      const departureClient = item.departure_order.client;
      const departureCustomer = item.departure_order.customer;
      const productClientAssignments = item.product.clientAssignments || [];
      const primaryProductClient = productClientAssignments[0]?.client;
      
      // Determine client information (departure order takes priority)
      let clientName = null;
      let clientId = null;
      
      if (departureClient) {
        clientName = departureClient.company_name || `${departureClient.first_names || ''} ${departureClient.last_name || ''}`.trim();
        clientId = departureClient.client_id;
      } else if (departureCustomer) {
        clientName = departureCustomer.name;
        clientId = departureCustomer.customer_id;
      } else if (primaryProductClient) {
        clientName = primaryProductClient.company_name || `${primaryProductClient.first_names || ''} ${primaryProductClient.last_name || ''}`.trim();
        clientId = primaryProductClient.client_id;
      }

      return {
        type: 'STOCK_OUT',
        product_code: item.product.product_code,
        product_name: item.product.name,
        manufacturer: item.product.manufacturer,
        category: item.product.category?.name,
        client_id: clientId,
        client_name: clientName,
        customer_name: clientName, // For backward compatibility
        customer_code: clientId, // For backward compatibility
        departure_order_code: item.departure_order.departure_order_no,
        departure_date: item.departure_order.departure_date_time,
        lot_number: item.lot_series || item.departureAllocations[0]?.source_allocation?.entry_order_product?.lot_series,
        quantity_units: item.dispatched_quantity || item.requested_quantity || item.departureAllocations.reduce((sum, alloc) => sum + (alloc.allocated_quantity || 0), 0),
        package_quantity: item.dispatched_packages || item.requested_packages,
        warehouse_quantity: item.departureAllocations.reduce((sum, alloc) => sum + (alloc.allocated_quantity || 0), 0),
        weight: item.dispatched_weight || item.requested_weight,
        volume: item.dispatched_volume || item.requested_volume,
        financial_value: parseFloat(item.departureAllocations[0]?.source_allocation?.entry_order_product?.insured_value || 0),
        entry_order_code: item.departureAllocations[0]?.source_allocation?.entry_order_product?.entry_order?.entry_order_no,
        entry_date: item.departureAllocations[0]?.source_allocation?.entry_order_product?.entry_order?.entry_date_time
      };
    });

    // Combine and sort all data
    const reportData = [...stockInProcessed, ...stockOutProcessed].sort((a, b) => {
      const dateA = new Date(a.entry_date || a.departure_date);
      const dateB = new Date(b.entry_date || b.departure_date);
      return dateB - dateA;
    });

    // Generate summary statistics
    const summary = {
      total_records: reportData.length,
      stock_in_records: stockInProcessed.length,
      stock_out_records: stockOutProcessed.length,
      total_stock_in_quantity: stockInProcessed.reduce((sum, item) => sum + (item.quantity_units || 0), 0),
      total_stock_out_quantity: stockOutProcessed.reduce((sum, item) => sum + (item.quantity_units || 0), 0),
      total_stock_in_value: stockInProcessed.reduce((sum, item) => sum + (item.financial_value || 0), 0),
      total_stock_out_value: stockOutProcessed.reduce((sum, item) => sum + (item.financial_value || 0), 0),
      products_breakdown: reportData.reduce((acc, item) => {
        const key = `${item.product_code}-${item.product_name}`;
        if (!acc[key]) {
          acc[key] = { stock_in: 0, stock_out: 0 };
        }
        if (item.type === 'STOCK_IN') {
          acc[key].stock_in += item.quantity_units || 0;
        } else {
          acc[key].stock_out += item.quantity_units || 0;
        }
        return acc;
      }, {})
    };

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      message: "Product-wise report generated successfully",
      data: reportData,
      summary,
      filters_applied: filters,
      user_role: userContext.userRole,
      is_client_filtered: ['CLIENT', 'WAREHOUSE_ASSISTANT'].includes(userContext.userRole),
      report_generated_at: new Date().toISOString(),
      processing_time_ms: processingTime
    };

  } catch (error) {
    console.error("Error generating product-wise report:", error);
    return {
      success: false,
      message: "Error generating product-wise report",
      error: error.message
    };
  }
}

async function generateCardexReport(filters, userContext) {
  const startTime = Date.now();
  
  try {
    console.log("📊 Starting cardex report generation...");

    // Determine date range for opening balance calculation
    const reportDateFrom = filters.date_from ? new Date(filters.date_from) : new Date('2020-01-01');
    const reportDateTo = filters.date_to ? new Date(filters.date_to) : new Date();

    // Build base query conditions for filtering products
    const productWhereConditions = {};
    
    // Product filtering
    if (filters.product_name || filters.product_code) {
      const productFilter = {
        OR: [
          filters.product_name ? { name: { contains: filters.product_name, mode: 'insensitive' } } : {},
          filters.product_code ? { product_code: { contains: filters.product_code, mode: 'insensitive' } } : {}
        ].filter(condition => Object.keys(condition).length > 0)
      };
      Object.assign(productWhereConditions, productFilter);
    }

    // ✅ Customer filtering for orders (fixed to use correct database relationships)
    const entryOrderFilter = {};
    
    // Customer filtering implementation (simplified to avoid complex nested queries)
    if (filters.customer_name || filters.customer_code) {
      // Simple approach: filter by creator with CLIENT role
      entryOrderFilter.creator = {
        role: { name: 'CLIENT' },
        OR: [
          { first_name: { contains: filters.customer_name, mode: 'insensitive' } },
          { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
        ]
      };
    }

    // Role-based access control for entry orders
    let clientFilter = {};
    if (userContext.userRole === 'CLIENT') {
      if (userContext.client_id) {
        clientFilter = {
          client_id: userContext.client_id,
          ...(userContext.is_primary_user ? {} : { created_by: userContext.userId })
        };
      } else {
        // Fallback: filter by created_by if no client_id
        clientFilter = {
          created_by: userContext.userId
        };
      }
    } else if (userContext.userRole === 'WAREHOUSE_ASSISTANT') {
      const clientAssignments = await prisma.clientProductAssignment.findMany({
        where: { user_id: userContext.userId },
        select: { client_id: true }
      });
      
      if (clientAssignments.length > 0) {
        clientFilter = {
          client_id: { in: clientAssignments.map(ca => ca.client_id) }
        };
      }
    }

    // Combine customer and client filters for entry orders
    const finalEntryOrderFilter = {
      ...entryOrderFilter,
      ...clientFilter
    };

    // ✅ Create departure order customer filtering
    const departureOrderFilter = {};
    if (filters.customer_name || filters.customer_code) {
      departureOrderFilter.OR = [
        // Filter by Customer model
        filters.customer_name ? {
          customer: { 
            name: { contains: filters.customer_name, mode: 'insensitive' } 
          }
        } : {},
        // Filter by Client model
        filters.customer_name ? {
          client: {
            OR: [
              { company_name: { contains: filters.customer_name, mode: 'insensitive' } },
              { first_names: { contains: filters.customer_name, mode: 'insensitive' } },
              { last_name: { contains: filters.customer_name, mode: 'insensitive' } }
            ]
          }
        } : {}
      ].filter(condition => Object.keys(condition).length > 0);
    }

    // Combine customer and client filters for departure orders
    const finalDepartureOrderFilter = {
      ...departureOrderFilter,
      ...clientFilter
    };

    // Get all entry order products that match our criteria for opening balance calculation
    const allEntryOrderProducts = await prisma.entryOrderProduct.findMany({
      where: {
        product: productWhereConditions,
        entry_order: finalEntryOrderFilter
      },
      include: {
        product: {
          include: {
            category: true,
            subcategory1: true,
            subcategory2: true,
            clientAssignments: {
              where: { is_active: true },
              select: {
                client_id: true,
                client_product_code: true,
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        entry_order: {
          include: {
            creator: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                role: { select: { name: true } }
              }
            }
          }
        }
      },
      orderBy: {
        entry_order: {
          entry_date_time: 'asc'
        }
      }
    });

    // Get all departure order products that match our criteria
    const allDepartureOrderProducts = await prisma.departureOrderProduct.findMany({
      where: {
        product: productWhereConditions,
        departure_order: finalDepartureOrderFilter
      },
      include: {
        product: {
          include: {
            category: true,
            subcategory1: true,
            subcategory2: true,
            clientAssignments: {
              where: { is_active: true },
              select: {
                client_id: true,
                client_product_code: true,
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        departure_order: {
          include: {
            customer: true,
            client: true
          }
        },
        departureAllocations: {
          include: {
            source_allocation: {
              include: {
                entry_order_product: {
                  select: {
                    insured_value: true,
                    inventory_quantity: true,
                    lot_series: true,
                    expiration_date: true,
                    manufacturing_date: true,
                    entry_order_id: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        departure_order: {
          departure_date_time: 'asc'
        }
      }
    });

    // Process cardex data by product
    const cardexData = {};

    // Process entry order products
    allEntryOrderProducts.forEach(entryProduct => {
      const productKey = `${entryProduct.product.product_code}-${entryProduct.product.name}`;
      const entryDate = new Date(entryProduct.entry_order.entry_date_time);
      
      if (!cardexData[productKey]) {
        // Get client information from product assignments or order creator
        const productClientAssignments = entryProduct.product.clientAssignments || [];
        const primaryClient = productClientAssignments[0]?.client;
        const orderCreator = entryProduct.entry_order.creator;
        
        // Determine client information
        let clientName = null;
        let clientId = null;
        
        if (primaryClient) {
          clientName = primaryClient.company_name || `${primaryClient.first_names || ''} ${primaryClient.last_name || ''}`.trim();
          clientId = primaryClient.client_id;
        } else if (orderCreator?.role?.name === 'CLIENT') {
          clientName = `${orderCreator.first_name || ''} ${orderCreator.last_name || ''}`.trim();
          clientId = orderCreator.id;
        }

        cardexData[productKey] = {
          product_code: entryProduct.product.product_code,
          product_name: entryProduct.product.name,
          manufacturer: entryProduct.product.manufacturer,
          category: entryProduct.product.category?.name,
          subcategory1: entryProduct.product.subcategory1?.name,
          subcategory2: entryProduct.product.subcategory2?.name,
          client_id: clientId,
          client_name: clientName,
          opening_balance: { quantity: 0, financial_value: 0 },
          stock_in: { quantity: 0, financial_value: 0 },
          stock_out: { quantity: 0, financial_value: 0 },
          closing_balance: { quantity: 0, financial_value: 0 },
          movements: [],
          lot_numbers: new Set(), // Track unique lot numbers
          expiry_dates: new Set() // Track unique expiry dates
        };
      }

      const quantity = entryProduct.inventory_quantity || 0;
      // ✅ CORRECT: Use original insured_value from entry order as source of truth
      const financialValue = parseFloat(entryProduct.insured_value) || 0;

      // Determine if this is opening balance or stock in based on report date range
      if (entryDate < reportDateFrom) {
        // This is part of opening balance
        cardexData[productKey].opening_balance.quantity += quantity;
        cardexData[productKey].opening_balance.financial_value += financialValue;
      } else if (entryDate <= reportDateTo) {
        // This is stock in during the report period
        cardexData[productKey].stock_in.quantity += quantity;
        cardexData[productKey].stock_in.financial_value += financialValue;
        
        // Track lot numbers and expiry dates
        if (entryProduct.lot_series) {
          cardexData[productKey].lot_numbers.add(entryProduct.lot_series);
        }
        if (entryProduct.expiration_date) {
          cardexData[productKey].expiry_dates.add(entryProduct.expiration_date.toISOString());
        }
        
        cardexData[productKey].movements.push({
          type: 'STOCK_IN',
          date: entryDate,
          reference: entryProduct.entry_order.entry_order_no,
          lot_number: entryProduct.lot_series,
          expiration_date: entryProduct.expiration_date,
          manufacturing_date: entryProduct.manufacturing_date,
          quantity: quantity,
          financial_value: financialValue,
          client_name: cardexData[productKey].client_name
        });
      }
    });

    // Process departure order products
    allDepartureOrderProducts.forEach(departureProduct => {
      const productKey = `${departureProduct.product.product_code}-${departureProduct.product.name}`;
      const departureDate = new Date(departureProduct.departure_order.departure_date_time);
      
      if (!cardexData[productKey]) {
        // Get client information from departure order or product assignments
        const departureClient = departureProduct.departure_order.client;
        const departureCustomer = departureProduct.departure_order.customer;
        const productClientAssignments = departureProduct.product.clientAssignments || [];
        const primaryProductClient = productClientAssignments[0]?.client;
        
        // Determine client information (departure order takes priority)
        let clientName = null;
        let clientId = null;
        
        if (departureClient) {
          clientName = departureClient.company_name || `${departureClient.first_names || ''} ${departureClient.last_name || ''}`.trim();
          clientId = departureClient.client_id;
        } else if (departureCustomer) {
          clientName = departureCustomer.name;
          clientId = departureCustomer.customer_id;
        } else if (primaryProductClient) {
          clientName = primaryProductClient.company_name || `${primaryProductClient.first_names || ''} ${primaryProductClient.last_name || ''}`.trim();
          clientId = primaryProductClient.client_id;
        }

        cardexData[productKey] = {
          product_code: departureProduct.product.product_code,
          product_name: departureProduct.product.name,
          manufacturer: departureProduct.product.manufacturer,
          category: departureProduct.product.category?.name,
          subcategory1: departureProduct.product.subcategory1?.name,
          subcategory2: departureProduct.product.subcategory2?.name,
          client_id: clientId,
          client_name: clientName,
          opening_balance: { quantity: 0, financial_value: 0 },
          stock_in: { quantity: 0, financial_value: 0 },
          stock_out: { quantity: 0, financial_value: 0 },
          closing_balance: { quantity: 0, financial_value: 0 },
          movements: [],
          lot_numbers: new Set(), // Track unique lot numbers
          expiry_dates: new Set() // Track unique expiry dates
        };
      }

      const quantity = departureProduct.dispatched_quantity || departureProduct.requested_quantity || 0;
      
      // ✅ Calculate financial value using smart estimation from entry orders
      let financialValue = 0;
      
      // Find all entry orders for the same product to calculate average unit cost
      const productEntryOrders = allEntryOrderProducts.filter(eop => 
        eop.product_id === departureProduct.product_id
      );
      
      if (productEntryOrders.length > 0) {
        // Calculate average unit cost from all entry orders for this product
        let totalEntryValue = 0;
        let totalEntryQuantity = 0;
        
        productEntryOrders.forEach(eop => {
          const entryValue = parseFloat(eop.insured_value || 0);
          const entryQuantity = eop.inventory_quantity || 0;
          totalEntryValue += entryValue;
          totalEntryQuantity += entryQuantity;
        });
        
        if (totalEntryQuantity > 0) {
          const averageUnitCost = totalEntryValue / totalEntryQuantity;
          financialValue = averageUnitCost * quantity;
        }
      }

      // Determine if this affects opening balance or stock out based on report date range
      if (departureDate < reportDateFrom) {
        // This reduces opening balance
        cardexData[productKey].opening_balance.quantity -= quantity;
        cardexData[productKey].opening_balance.financial_value -= financialValue;
      } else if (departureDate <= reportDateTo) {
        // This is stock out during the report period
        cardexData[productKey].stock_out.quantity += quantity;
        cardexData[productKey].stock_out.financial_value += financialValue;
        
        // Get lot number and expiry date from source allocation
        const sourceAllocation = departureProduct.departureAllocations?.[0]?.source_allocation;
        const entryOrderProduct = sourceAllocation?.entry_order_product;
        const lotNumber = entryOrderProduct?.lot_series || departureProduct.lot_series;
        const expirationDate = entryOrderProduct?.expiration_date;
        
        // Track lot numbers and expiry dates
        if (lotNumber) {
          cardexData[productKey].lot_numbers.add(lotNumber);
        }
        if (expirationDate) {
          cardexData[productKey].expiry_dates.add(expirationDate.toISOString());
        }
        
        cardexData[productKey].movements.push({
          type: 'STOCK_OUT',
          date: departureDate,
          reference: departureProduct.departure_order.departure_order_no,
          lot_number: lotNumber,
          expiration_date: expirationDate,
          manufacturing_date: entryOrderProduct?.manufacturing_date,
          quantity: quantity,
          financial_value: financialValue,
          client_name: cardexData[productKey].client_name
        });
      }
    });

    // Calculate closing balance for each product and sort movements
    Object.values(cardexData).forEach(productData => {
      // Calculate closing balance: opening + stock_in - stock_out
      productData.closing_balance.quantity = 
        productData.opening_balance.quantity + 
        productData.stock_in.quantity - 
        productData.stock_out.quantity;
      
      productData.closing_balance.financial_value = 
        productData.opening_balance.financial_value + 
        productData.stock_in.financial_value - 
        productData.stock_out.financial_value;

      // Sort movements by date
      productData.movements.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Convert Sets to arrays for JSON serialization
      productData.lot_numbers = Array.from(productData.lot_numbers);
      productData.expiry_dates = Array.from(productData.expiry_dates).map(date => new Date(date));
    });

    // Convert to array and filter out products with no activity
    const reportData = Object.values(cardexData).filter(product => 
      product.opening_balance.quantity !== 0 || 
      product.stock_in.quantity !== 0 || 
      product.stock_out.quantity !== 0
    );

    // Generate summary statistics
    const summary = {
      total_products: reportData.length,
      total_opening_balance_quantity: reportData.reduce((sum, item) => sum + item.opening_balance.quantity, 0),
      total_opening_balance_value: reportData.reduce((sum, item) => sum + item.opening_balance.financial_value, 0),
      total_stock_in_quantity: reportData.reduce((sum, item) => sum + item.stock_in.quantity, 0),
      total_stock_in_value: reportData.reduce((sum, item) => sum + item.stock_in.financial_value, 0),
      total_stock_out_quantity: reportData.reduce((sum, item) => sum + item.stock_out.quantity, 0),
      total_stock_out_value: reportData.reduce((sum, item) => sum + item.stock_out.financial_value, 0),
      total_closing_balance_quantity: reportData.reduce((sum, item) => sum + item.closing_balance.quantity, 0),
      total_closing_balance_value: reportData.reduce((sum, item) => sum + item.closing_balance.financial_value, 0),
      categories_breakdown: reportData.reduce((acc, item) => {
        if (item.category) {
          acc[item.category] = (acc[item.category] || 0) + 1;
        }
        return acc;
      }, {})
    };

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      message: "Cardex report generated successfully",
      data: reportData,
      summary,
      filters_applied: filters,
      user_role: userContext.userRole,
      is_client_filtered: ['CLIENT', 'WAREHOUSE_ASSISTANT'].includes(userContext.userRole),
      report_generated_at: new Date().toISOString(),
      processing_time_ms: processingTime
    };

  } catch (error) {
    console.error("Error generating cardex report:", error);
    return {
      success: false,
      message: "Error generating cardex report",
      error: error.message
    };
  }
}

module.exports = {
  generateWarehouseReport,
  generateProductCategoryReport,
  generateProductWiseReport,
  generateCardexReport,
};