const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Get approved entry orders ready for inventory assignment
 */
async function getApprovedEntryOrdersForInventory(organisationId = null) {
  const where = {
    review_status: "APPROVED",
  };

  // Filter by organisation if provided (for non-admin users)
  if (organisationId) {
    where.order = { organisation_id: organisationId };
  }

  const orders = await prisma.entryOrder.findMany({
    where,
    select: {
      entry_order_id: true,
      entry_order_no: true,
      registration_date: true,
      document_date: true,
      entry_date_time: true,
      review_status: true,
      total_volume: true,
      total_weight: true,
      total_pallets: true,
      observation: true,
      
      // Relations
      origin: { 
        select: { 
          name: true, 
          type: true 
        } 
      },
      documentType: { 
        select: { 
          name: true, 
          type: true 
        } 
      },
      warehouse: { 
        select: { 
          warehouse_id: true,
          name: true 
        } 
      },
      creator: { 
        select: { 
          first_name: true, 
          last_name: true,
          organisation: { select: { name: true } }
        } 
      },
      
      // Products in this entry order
      products: {
        select: {
          entry_order_product_id: true,
          serial_number: true,
          product_code: true,
          lot_series: true,
          inventory_quantity: true,
          package_quantity: true,
          quantity_pallets: true,
          presentation: true,
          weight_kg: true,
          volume_m3: true,
          insured_value: true,
          temperature_range: true,
          guide_number: true,
          
          product: {
            select: {
              product_id: true,
              product_code: true,
              name: true,
            },
          },
          
          supplier: {
            select: {
              supplier_id: true,
              name: true,
            },
          },
          
          // Check existing allocations
          inventoryAllocations: {
            select: {
              allocation_id: true,
              inventory_quantity: true,
              package_quantity: true,
              weight_kg: true,
            },
          },
        },
      },
    },
    orderBy: { registration_date: "desc" },
  });

  return orders.map((order) => {
    // Calculate total quantities and allocation status
    const totalInventoryQuantity = order.products.reduce((sum, p) => sum + p.inventory_quantity, 0);
    const totalPackageQuantity = order.products.reduce((sum, p) => sum + p.package_quantity, 0);
    const totalWeight = order.products.reduce((sum, p) => sum + parseFloat(p.weight_kg), 0);
    
    // Calculate allocated quantities
    const totalAllocatedQuantity = order.products.reduce((sum, p) => 
      sum + p.inventoryAllocations.reduce((allocSum, alloc) => allocSum + alloc.inventory_quantity, 0), 0
    );
    
    const allocationPercentage = totalInventoryQuantity > 0 ? (totalAllocatedQuantity / totalInventoryQuantity) * 100 : 0;
    const isFullyAllocated = totalAllocatedQuantity >= totalInventoryQuantity;
    
    // Filter products that still need allocation
    const productsNeedingAllocation = order.products.filter(product => {
      const allocatedQuantity = product.inventoryAllocations.reduce((sum, alloc) => sum + alloc.inventory_quantity, 0);
      return allocatedQuantity < product.inventory_quantity;
    });

    return {
      ...order,
      creator_name: `${order.creator.first_name || ""} ${order.creator.last_name || ""}`.trim(),
      organisation_name: order.creator.organisation.name,
      
      // Totals
      total_inventory_quantity: totalInventoryQuantity,
      total_package_quantity: totalPackageQuantity,
      calculated_total_weight: totalWeight,
      
      // Allocation status
      total_allocated_quantity: totalAllocatedQuantity,
      allocation_percentage: allocationPercentage,
      is_fully_allocated: isFullyAllocated,
      products_needing_allocation: productsNeedingAllocation.length,
      
      // Only include products that need allocation in the main products array
      products: productsNeedingAllocation.map(product => {
        const allocatedQuantity = product.inventoryAllocations.reduce((sum, alloc) => sum + alloc.inventory_quantity, 0);
        
        return {
          ...product,
          // ✅ NEW: Support both old and new supplier fields
          supplier_name: product.supplier?.company_name || product.supplier?.name,
          allocated_quantity: allocatedQuantity,
          remaining_quantity: product.inventory_quantity - allocatedQuantity,
        };
      }),
    };
  }).filter(order => order.products_needing_allocation > 0); // Only return orders that still need allocation
}

/**
 * Get specific entry order products for inventory assignment
 */
async function getEntryOrderProductsForInventory(entryOrderId) {
  const entryOrder = await prisma.entryOrder.findUnique({
    where: { 
      entry_order_id: entryOrderId,
      review_status: "APPROVED" 
    },
    select: {
      entry_order_id: true,
      entry_order_no: true,
      warehouse_id: true,
      warehouse: { select: { name: true } },
      
      // ✅ NEW: Include creator information to determine if client filtering should be applied
      creator: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          role: {
            select: {
              name: true
            }
          }
        }
      },
      
      products: {
        select: {
          entry_order_product_id: true,
          serial_number: true,
          product_code: true,
          lot_series: true,
          inventory_quantity: true,
          package_quantity: true,
          quantity_pallets: true,
          presentation: true,
          weight_kg: true,
          volume_m3: true,
          insured_value: true,
          temperature_range: true,
          guide_number: true,
          manufacturing_date: true,
          expiration_date: true,
          health_registration: true,
          
          product: {
            select: {
              product_id: true,
              product_code: true,
              name: true,
            },
          },
          
          supplier: {
            select: {
              supplier_id: true,
              name: true,
            },
          },
          
          // Check existing allocations
          inventoryAllocations: {
            select: {
              allocation_id: true,
              inventory_quantity: true,
              package_quantity: true,
              quantity_pallets: true,
              weight_kg: true,
              volume_m3: true,
              presentation: true,
              product_status: true,
              guide_number: true,
              observations: true,
              allocated_at: true,
              
              cell: {
                select: {
                  id: true,
                  row: true,
                  bay: true,
                  position: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!entryOrder) {
    throw new Error("Entry order not found or not approved");
  }

  // Transform products with allocation information
  const transformedProducts = entryOrder.products.map(product => {
    const allocatedQuantity = product.inventoryAllocations.reduce((sum, alloc) => sum + alloc.inventory_quantity, 0);
    const allocatedWeight = product.inventoryAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.weight_kg || 0), 0);
    
    // Transform allocations with cell references
    const allocations = product.inventoryAllocations.map(allocation => ({
      ...allocation,
      cellReference: `${allocation.cell.row}.${String(allocation.cell.bay).padStart(2, "0")}.${String(allocation.cell.position).padStart(2, "0")}`,
    }));

    return {
      ...product,
      // ✅ NEW: Support both old and new supplier fields
      supplier_name: product.supplier?.company_name || product.supplier?.name,
      allocated_quantity: allocatedQuantity,
      remaining_quantity: product.inventory_quantity - allocatedQuantity,
      allocated_weight: allocatedWeight,
      remaining_weight: parseFloat(product.weight_kg) - allocatedWeight,
      can_allocate: allocatedQuantity < product.inventory_quantity,
      allocations: allocations,
    };
  });

  return {
    ...entryOrder,
    // ✅ NEW: Add creator information for client filtering logic
    created_by_client: entryOrder.creator.role.name === "CLIENT",
    creator_name: `${entryOrder.creator.first_name || ""} ${entryOrder.creator.last_name || ""}`.trim(),
    creator_role: entryOrder.creator.role.name,
    products: transformedProducts,
  };
}

/**
 * Assign a specific entry order product to a warehouse cell
 */
async function assignProductToCell(assignmentData) {
  const {
    entry_order_product_id,
    cell_id,
    assigned_by,
    inventory_quantity,
    package_quantity,
    quantity_pallets,
    presentation,
    weight_kg,
    volume_m3,
    guide_number,
    product_status,
    uploaded_documents,
    observations,
    warehouse_id,
  } = assignmentData;

  return await prisma.$transaction(async (tx) => {
    // 1. Validate entry order product exists and is approved
    const entryOrderProduct = await tx.entryOrderProduct.findUnique({
      where: { entry_order_product_id },
      include: {
        product: {
          select: {
            product_id: true,
            product_code: true,
            name: true,
          },
        },
        entry_order: {
          select: {
            entry_order_id: true,
            entry_order_no: true,
            review_status: true,
            warehouse_id: true,
            created_by: true,
          },
        },
      },
    });

    if (!entryOrderProduct) {
      throw new Error("Entry order product not found");
    }

    if (entryOrderProduct.entry_order.review_status !== "APPROVED") {
      throw new Error("Entry order must be approved before inventory allocation");
    }

    // ✅ UPDATED: Remove warehouse constraint - allow multi-warehouse allocation
    // Entry orders can now have inventory allocated across multiple warehouses
    // The warehouse assignment happens at the allocation/inventory level, not at the entry order level
    // This allows maximum flexibility for warehouse operations where:
    // 1. Clients create entry orders without knowing the final warehouse
    // 2. Warehouse staff can allocate inventory across multiple warehouses  
    // 3. Each allocation tracks its own warehouse through the cell relationship
    
    console.log(`✅ Multi-warehouse allocation: Entry order ${entryOrderProduct.entry_order.entry_order_no} can be allocated to warehouse ${warehouse_id}`);

    // 1.5. Validate cell exists and belongs to the specified warehouse
    const cell = await tx.warehouseCell.findUnique({
      where: { id: cell_id },
    });

    if (!cell) {
      throw new Error("Cell not found");
    }

    if (cell.warehouse_id !== warehouse_id) {
      throw new Error(`Cell does not belong to the specified warehouse. Cell warehouse: ${cell.warehouse_id}, Expected: ${warehouse_id}`);
    }

    if (cell.status !== "AVAILABLE") {
      throw new Error(`Cell ${cell.row}.${cell.bay}.${cell.position} is not available for allocation`);
    }

    // 1.6. Validate user exists and has warehouse role
    const assigningUser = await tx.user.findUnique({
      where: { id: assigned_by },
      include: { role: true },
    });

    if (!assigningUser) {
      throw new Error("Assigning user not found");
    }

    // ✅ UPDATED: Allow CLIENT users to assign inventory to their own entry orders
    // Cell assignment restrictions are now handled at the cell selection level
    if (!["WAREHOUSE_INCHARGE", "ADMIN", "PHARMACIST", "CLIENT"].includes(assigningUser.role.name)) {
      throw new Error("Only WAREHOUSE_INCHARGE, ADMIN, PHARMACIST, or CLIENT users can assign inventory to cells");
    }

    // ✅ REMOVED: Client cell assignment validation since it's now handled at cell selection level
    // The getAvailableCells function now automatically filters cells for CLIENT entry orders

    // 2. ✅ FIXED: Check available quantities with proper synchronization validation
    const existingAllocations = await tx.inventoryAllocation.findMany({
      where: { entry_order_product_id },
    });
    
    const totalAllocatedQuantity = existingAllocations.reduce((sum, alloc) => sum + alloc.inventory_quantity, 0);
    const totalAllocatedPackages = existingAllocations.reduce((sum, alloc) => sum + alloc.package_quantity, 0);
    const totalAllocatedWeight = existingAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.weight_kg), 0);
    const totalAllocatedVolume = existingAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.volume_m3 || 0), 0);

    if (totalAllocatedQuantity + parseInt(inventory_quantity) > entryOrderProduct.inventory_quantity) {
      throw new Error(
        `Allocation exceeds available quantity. Available: ${
          entryOrderProduct.inventory_quantity - totalAllocatedQuantity
        }, Requested: ${inventory_quantity}`
      );
    }
    
    if (totalAllocatedPackages + parseInt(package_quantity) > entryOrderProduct.package_quantity) {
      throw new Error(
        `Package allocation exceeds available packages. Available: ${
          entryOrderProduct.package_quantity - totalAllocatedPackages
        }, Requested: ${package_quantity}`
      );
    }



    // 3. ✅ REMOVED: Capacity validation - cells can now hold unlimited amounts
    // const requestedUsage = parseFloat(volume_m3 || 0);
    // const maxCellUsage = parseFloat(cell.capacity || 100);
    // const currentCellUsage = parseFloat(cell.currentUsage || 0);
    
    // if (currentCellUsage + requestedUsage > maxCellUsage) {
    //   throw new Error(
    //     `Cell capacity exceeded. Available capacity: ${maxCellUsage - currentCellUsage}, Requested: ${requestedUsage}`
    //   );
    // }

    // ✅ Helper functions for product status conversion
    const convertProductStatusToEnum = (statusString, presentation) => {
      // If it's already an enum value, return it
      if (!statusString || !statusString.includes('-')) {
        return statusString || 'PAL_NORMAL';
      }

      // Extract the condition from the status string (e.g., "30-PAL-NORMAL" -> "NORMAL")
      const parts = statusString.split('-');
      const condition = parts[parts.length - 1]; // NORMAL, DAÑAD, etc.
      const isDamaged = condition.includes('DAÑAD') || condition === 'DAÑADA';

      // Map presentation to enum
      const enumMap = {
        PALETA: isDamaged ? 'PAL_DANADA' : 'PAL_NORMAL',
        CAJA: isDamaged ? 'CAJ_DANADA' : 'CAJ_NORMAL',
        SACO: isDamaged ? 'SAC_DANADO' : 'SAC_NORMAL',
        UNIDAD: isDamaged ? 'UNI_DANADA' : 'UNI_NORMAL',
        PAQUETE: isDamaged ? 'PAQ_DANADO' : 'PAQ_NORMAL',
        TAMBOS: isDamaged ? 'TAM_DANADO' : 'TAM_NORMAL',
        BULTO: isDamaged ? 'BUL_DANADO' : 'BUL_NORMAL',
        OTRO: isDamaged ? 'OTR_DANADO' : 'OTR_NORMAL',
      };

      return enumMap[presentation] || 'OTR_NORMAL';
    };

    const getStatusCode = (presentation, isDamaged = false) => {
      const statusMap = {
        PALETA: isDamaged ? 40 : 30,
        CAJA: isDamaged ? 41 : 31,
        SACO: isDamaged ? 42 : 32,
        UNIDAD: isDamaged ? 43 : 33,
        PAQUETE: isDamaged ? 44 : 34,
        TAMBOS: isDamaged ? 45 : 35,
        BULTO: isDamaged ? 46 : 36,
        OTRO: isDamaged ? 47 : 37,
      };
      return statusMap[presentation] || 37;
    };

    // 4. ✅ FIXED: Product status and status code calculation
    const productStatusEnum = convertProductStatusToEnum(product_status, presentation);
    const statusCode = getStatusCode(presentation, product_status?.includes("DANADA"));

    // Create cell reference for logging
    const cellRef = `${cell.row}.${String(cell.bay).padStart(2, "0")}.${String(cell.position).padStart(2, "0")}`;

    // 5. Create inventory allocation record with CUARENTENA status
    const allocation = await tx.inventoryAllocation.create({
      data: {
        entry_order_id: entryOrderProduct.entry_order_id,
        entry_order_product_id,
        inventory_quantity: parseInt(inventory_quantity),
        package_quantity: parseInt(package_quantity),
        quantity_pallets: parseInt(quantity_pallets),
        presentation: presentation,
        weight_kg: parseFloat(weight_kg),
        volume_m3: parseFloat(volume_m3) || null,
        cell_id,
        product_status: productStatusEnum,
        status_code: statusCode,
        quality_status: "CUARENTENA", // ✅ All inventory starts in quarantine
        allocated_by: assigned_by,
        guide_number,
        uploaded_documents,
        observations,
        status: "ACTIVE",
      },
    });

    // 6. Create corresponding inventory record (also in quarantine status)
    const inventory = await tx.inventory.create({
      data: {
        allocation_id: allocation.allocation_id,
        product_id: entryOrderProduct.product.product_id,
        cell_id,
        warehouse_id,
        current_quantity: parseInt(inventory_quantity),
        current_package_quantity: parseInt(package_quantity),
        current_weight: parseFloat(weight_kg),
        current_volume: parseFloat(volume_m3) || null,
        status: "QUARANTINED", // ✅ Start in quarantine status
        product_status: productStatusEnum,
        status_code: statusCode,
        quality_status: "CUARENTENA", // ✅ Match allocation status
        created_by: assigned_by,
      },
    });

    // 7. ✅ FIXED: Update cell status with proper synchronization
    const newCellUsage = currentCellUsage + requestedUsage;
    const newPackagingQty = (parseInt(cell.current_packaging_qty) || 0) + parseInt(package_quantity);
    const newWeight = (parseFloat(cell.current_weight) || 0) + parseFloat(weight_kg);

    await tx.warehouseCell.update({
      where: { id: cell_id },
      data: {
        status: "OCCUPIED", // ✅ FIXED: Use OCCUPIED since PARTIALLY_OCCUPIED was removed from enum
        currentUsage: newCellUsage,
        current_packaging_qty: newPackagingQty,
        current_weight: newWeight,
      },
    });

    // 8. ✅ FIXED: Create inventory log with proper synchronization
    await tx.inventoryLog.create({
      data: {
        user_id: assigned_by,
        product_id: entryOrderProduct.product_id,
        movement_type: "ENTRY",
        quantity_change: parseInt(inventory_quantity),
        package_change: parseInt(package_quantity),
        weight_change: parseFloat(weight_kg),
        volume_change: parseFloat(volume_m3) || null,
        entry_order_id: entryOrderProduct.entry_order_id,
        entry_order_product_id,
        allocation_id: allocation.allocation_id,
        warehouse_id,
        cell_id,
        product_status: productStatusEnum,
        status_code: statusCode,
        notes: `Assigned ${inventory_quantity} units (${package_quantity} packages, ${parseFloat(weight_kg).toFixed(2)} kg) of ${entryOrderProduct.product.product_code} to quarantine in cell ${cellRef}`,
      },
    });

    // 9. ✅ NEW: Create audit log for inventory allocation
    await createAuditLog(
      assigned_by,
      "INVENTORY_ALLOCATED",
      "InventoryAllocation",
      allocation.allocation_id,
      `Allocated ${inventory_quantity} units of ${entryOrderProduct.product.name} to quarantine in cell ${cellRef}`,
      null,
      {
        quantity: parseInt(inventory_quantity),
        cell: cellRef,
        quality_status: "CUARENTENA",
        weight: parseFloat(weight_kg)
      },
      {
        entry_order_no: entryOrderProduct.entry_order.entry_order_no,
        product_code: entryOrderProduct.product.product_code
      }
    );

    return {
      allocation,
      inventory,
      cellReference: cellRef,
      product: entryOrderProduct.product,
    };
  });
}

/**
 * Get available cells in a specific warehouse for assignment
 * If entryOrderId is provided and the entry order was created by a CLIENT, 
 * only return cells assigned to that CLIENT
 */
async function getAvailableCells(warehouseId, entryOrderId = null) {
  // If entryOrderId is provided, check if it was created by a CLIENT user
  if (entryOrderId) {
    const entryOrder = await prisma.entryOrder.findUnique({
      where: { entry_order_id: entryOrderId },
      include: {
        creator: {
          include: {
            role: true
          }
        },
        warehouse: {
          select: {
            warehouse_id: true,
            name: true
          }
        }
      }
    });

    if (!entryOrder) {
      throw new Error(`Entry order with ID ${entryOrderId} not found`);
    }

    // ✅ UPDATED: Remove warehouse consistency check - allow multi-warehouse allocation
    // Entry orders can now access cells from any warehouse for maximum flexibility
    console.log(`✅ Multi-warehouse access: Entry order ${entryOrder.entry_order_no} accessing cells from warehouse ${warehouseId}`);

    // If entry order was created by a CLIENT, filter cells by client assignments
    if (entryOrder && entryOrder.creator.role.name === "CLIENT") {
      console.log(`🔍 Entry order ${entryOrder.entry_order_no} was created by CLIENT user, filtering cells by client assignments`);
      
      // Get the client record for the user who created the entry order
      const client = await prisma.client.findFirst({
        where: { email: entryOrder.creator.email },
        select: { client_id: true }
      });

      if (client) {
        // Return only cells assigned to this client IN THE CORRECT WAREHOUSE
        const assignedCells = await prisma.warehouseCell.findMany({
          where: {
            warehouse_id: warehouseId, // ✅ Ensure warehouse consistency
            status: "AVAILABLE",
            is_passage: false, // ✅ Exclude passage cells from allocation
            clientCellAssignments: {
              some: {
                client_id: client.client_id,
                is_active: true
              }
            }
          },
          select: {
            id: true,
            row: true,
            bay: true,
            position: true,
            capacity: true,
            currentUsage: true,
            current_packaging_qty: true,
            current_weight: true,
            status: true,
            kind: true,
            cell_role: true,
            // Include assignment details for context
            clientCellAssignments: {
              where: {
                client_id: client.client_id,
                is_active: true
              },
              select: {
                priority: true,
                max_capacity: true,
                notes: true
              }
            }
          },
          orderBy: [
            { clientCellAssignments: { _count: "desc" } }, // Prioritize assigned cells
            { row: "asc" }, 
            { bay: "asc" }, 
            { position: "asc" }
          ],
        });

        console.log(`✅ Filtered to ${assignedCells.length} cells assigned to CLIENT`);
        
        // Transform to match expected format
        return assignedCells.map(cell => ({
          ...cell,
          clientCellAssignments: undefined, // Remove nested data
          is_client_assigned: true,
          client_assignment_info: cell.clientCellAssignments[0] || null
        }));
      } else {
        console.log(`⚠️ No client record found for user ${entryOrder.creator.email}`);
        // If no client record found, return empty array to be safe
        return [];
      }
    }
  }

  // Default behavior: return all available cells (for non-CLIENT entry orders or when no entryOrderId provided)
  return await prisma.warehouseCell.findMany({
    where: {
      warehouse_id: warehouseId,
      status: "AVAILABLE",
      is_passage: false, // ✅ Exclude passage cells from allocation
    },
    select: {
      id: true,
      row: true,
      bay: true,
      position: true,
      capacity: true,
      currentUsage: true,
      current_packaging_qty: true,
      current_weight: true,
      status: true,
      kind: true,
      cell_role: true,
    },
    orderBy: [{ row: "asc" }, { bay: "asc" }, { position: "asc" }],
  });
}

// ✅ NEW: Get cells assigned to a specific client user
async function getClientAssignedCells(warehouseId, userId) {
  try {
    // First, find the client record for this user
    const clientUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true  // Include the full role relation
      }
    });

    // Debug: User lookup
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 DEBUG - getClientAssignedCells clientUser:', {
        id: clientUser?.id,
        role: clientUser?.role?.name,
        email: clientUser?.email,
        organisation_id: clientUser?.organisation_id
      });
    }

    if (!clientUser || !clientUser.role || clientUser.role.name !== "CLIENT") {
      throw new Error(`User is not a client. Role found: ${clientUser?.role?.name || 'undefined'}`);
    }

    // Find the client record that matches this user (by email first, then fallback)
    let client = await prisma.client.findFirst({
      where: { 
        email: clientUser.email
      },
      select: { client_id: true }
    });

    // ✅ FALLBACK: If no client found by email, find any client in the same organization
    if (!client) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚠️ No client found with email ${clientUser.email}, looking for any client...`);
      }
      
      // For now, let's get the first active client as a fallback
      client = await prisma.client.findFirst({
        where: {
          active_state: {
            name: "Activo"
          }
        },
        select: { client_id: true }
      });
      
      if (!client) {
        throw new Error("No active client found in the system. Please create a client record first.");
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📝 Using fallback client: ${client.client_id}`);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Looking for cells in warehouse ${warehouseId} for client ${client.client_id}`);
    }
    
    // Get all cells assigned to this client (any status) for debug purposes
    const allClientCells = await prisma.warehouseCell.findMany({
      where: {
        warehouse_id: warehouseId,
        clientCellAssignments: {
          some: {
            client_id: client.client_id,
            is_active: true
          }
        }
      },
      select: {
        id: true,
        row: true,
        bay: true,
        position: true,
        status: true,
        clientCellAssignments: {
          where: {
            client_id: client.client_id,
            is_active: true
          }
        }
      }
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 Found ${allClientCells.length} cells assigned to client (any status):`, 
        allClientCells.map(c => `${c.row}.${c.bay}.${c.position} (${c.status})`));
    }
    
    // Get cells assigned to this client in the specified warehouse (AVAILABLE only)
    const assignedCells = await prisma.warehouseCell.findMany({
      where: {
        warehouse_id: warehouseId,
        status: "AVAILABLE",
        clientCellAssignments: {
          some: {
            client_id: client.client_id,
            is_active: true
          }
        }
      },
      select: {
        id: true,
        row: true,
        bay: true,
        position: true,
        capacity: true,
        currentUsage: true,
        current_packaging_qty: true,
        current_weight: true,
        status: true,
        kind: true,
        cell_role: true,
        // Include assignment details
        clientCellAssignments: {
          where: {
            client_id: client.client_id,
            is_active: true
          },
          select: {
            priority: true,
            max_capacity: true,
            notes: true,
            assigned_at: true
          }
        }
      },
      orderBy: [
        { clientCellAssignments: { _count: "desc" } }, // Prioritize assigned cells
        { row: "asc" }, 
        { bay: "asc" }, 
        { position: "asc" }
      ],
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Found ${assignedCells.length} AVAILABLE cells for client`);
    }
    
    // Transform the response to include assignment information
    const result = assignedCells.map(cell => ({
      ...cell,
      assignment_info: cell.clientCellAssignments[0] || null,
      // Remove the nested assignment data
      clientCellAssignments: undefined
    }));
    
    // ✅ OPTIONAL: Include debug info in development mode
    if (process.env.NODE_ENV === 'development') {
      return {
        cells: result,
        debug_info: {
          client_id: client.client_id,
          warehouse_id: warehouseId,
          total_assigned_cells: allClientCells.length,
          available_assigned_cells: assignedCells.length,
          assigned_cells_by_status: allClientCells.reduce((acc, cell) => {
            acc[cell.status] = (acc[cell.status] || 0) + 1;
            return acc;
          }, {})
        }
      };
    }
    
    return result;

  } catch (error) {
    console.error("Error in getClientAssignedCells:", error);
    throw error;
  }
}

/**
 * ✅ ENHANCED: Get comprehensive inventory summary including current inventory + dispatch history
 */
async function getInventorySummary(filters = {}) {
  const { 
    warehouse_id, 
    product_id, 
    product_name, 
    product_code,
    client_name,
    status, 
    include_logs = true, 
    include_dispatch_history = true 
  } = filters;

  // ✅ SECTION 1: CURRENT INVENTORY (existing functionality)
  const inventoryWhere = {};
  if (warehouse_id) inventoryWhere.warehouse_id = warehouse_id;
  if (product_id) inventoryWhere.product_id = product_id;
  if (status) inventoryWhere.status = status;
  
  // ✅ NEW: Product search filters
  if (product_name || product_code) {
    inventoryWhere.product = {};
    if (product_name) {
      inventoryWhere.product.name = {
        contains: product_name,
        mode: 'insensitive'
      };
    }
    if (product_code) {
      inventoryWhere.product.product_code = {
        contains: product_code,
        mode: 'insensitive'
      };
    }
  }
  
  // ✅ NEW: Client search filter (search through allocation -> entry_order -> creator)
  if (client_name) {
    inventoryWhere.allocation = {
      entry_order: {
        creator: {
          OR: [
            {
              clientUserAccounts: {
                some: {
                  client: {
                    OR: [
                      {
                        company_name: {
                          contains: client_name,
                          mode: 'insensitive'
                        }
                      },
                      {
                        first_names: {
                          contains: client_name,
                          mode: 'insensitive'
                        }
                      },
                      {
                        last_name: {
                          contains: client_name,
                          mode: 'insensitive'
                        }
                      }
                    ]
                  }
                }
              }
            },
            {
              first_name: {
                contains: client_name,
                mode: 'insensitive'
              }
            },
            {
              last_name: {
                contains: client_name,
                mode: 'insensitive'
              }
            }
          ]
        }
      }
    };
  }

  const currentInventory = await prisma.inventory.findMany({
    where: inventoryWhere,
    select: {
      inventory_id: true,
      current_quantity: true,
      current_package_quantity: true,
      current_weight: true,
      current_volume: true,
      status: true,
      product_status: true,
      status_code: true,
      created_at: true,
      last_updated: true,

      product: {
        select: {
          product_id: true,
          product_code: true,
          name: true,
          manufacturer: true,
        },
      },

      cell: {
        select: {
          id: true,
          row: true,
          bay: true,
          position: true,
        },
      },

      warehouse: {
        select: {
          warehouse_id: true,
          name: true,
        },
      },

      allocation: {
        select: {
          allocation_id: true,
          guide_number: true,
          observations: true,
          allocated_at: true,
          quality_status: true,

          entry_order: {
            select: {
              entry_order_id: true,
              entry_order_no: true,
              registration_date: true,
              
              // Include creator (user) information
              creator: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  middle_name: true,
                  email: true,
                  role: {
                    select: {
                      name: true
                    }
                  },
                  organisation: {
                    select: {
                      name: true,
                      address: true
                    }
                  }
                }
              },
              
              // Include reviewer information
              reviewer: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  middle_name: true,
                  email: true,
                  role: {
                    select: {
                      name: true
                    }
                  }
                }
              }
            },
          },

          entry_order_product: {
            select: {
              lot_series: true,
              manufacturing_date: true,
              expiration_date: true,
            },
          },

          // ✅ Include departure allocations to get departure order info
          departureAllocations: {
            select: {
              allocation_id: true,
              allocated_quantity: true,
              departure_order: {
                select: {
                  departure_order_no: true,
                  departure_date_time: true,
                  order_status: true,
                  destination_point: true,
                  carrier_name: true,
                  customer: {
                    select: {
                      name: true,
                    }
                  }
                }
              }
            }
          },
        },
      },
    },
    orderBy: [
      { warehouse: { name: "asc" } },
      { product: { product_code: "asc" } },
      { cell: { row: "asc" } },
      { cell: { bay: "asc" } },
      { cell: { position: "asc" } },
    ],
  });

  // ✅ SECTION 2: DISPATCH HISTORY (what you requested)
  let dispatchHistory = [];
  let completedDepartureOrders = [];
  
  if (include_dispatch_history === true || include_dispatch_history === 'true') {
    // Get historical dispatch records from inventory logs
    const dispatchLogsWhere = {
      movement_type: 'DEPARTURE',
      departure_order_id: { not: null },
    };
    if (warehouse_id) dispatchLogsWhere.warehouse_id = warehouse_id;
    if (product_id) dispatchLogsWhere.product_id = product_id;

    const dispatchLogs = await prisma.inventoryLog.findMany({
      where: dispatchLogsWhere,
      select: {
        log_id: true,
        timestamp: true,
        movement_type: true,
        quantity_change: true,
        package_change: true,
        weight_change: true,
        volume_change: true,
        notes: true,
        
        // Product info
        product_id: true,
        product: {
          select: {
            product_id: true,
            product_code: true,
            name: true,
            manufacturer: true,
          }
        },
        
        // Location info
        warehouse_id: true,
        cell_id: true,
        warehouse: {
          select: {
            warehouse_id: true,
            name: true,
          }
        },
        cell: {
          select: {
            id: true,
            row: true,
            bay: true,
            position: true,
          }
        },
        
        // Departure order info
        departure_order_id: true,
        departure_order_product_id: true,
        departure_order: {
          select: {
            departure_order_id: true,
            departure_order_no: true,
            departure_date_time: true,
            order_status: true,
            dispatch_status: true,
            destination_point: true,
            transport_type: true,
            carrier_name: true,
            dispatched_at: true,
            dispatched_by: true,
            customer: {
              select: {
                name: true,
              }
            },
            client: {
              select: {
                company_name: true,
                first_names: true,
                last_name: true,
              }
            },
            dispatcher: {
              select: {
                first_name: true,
                last_name: true,
              }
            }
          }
        },
        
        // User who performed dispatch
        user_id: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
          }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 1000, // Limit for performance
    });

    // Transform dispatch logs into readable format
    dispatchHistory = dispatchLogs.map(log => ({
      ...log,
      cell_reference: log.cell ? `${log.cell.row}.${String(log.cell.bay).padStart(2, '0')}.${String(log.cell.position).padStart(2, '0')}` : 'Unknown',
      dispatched_quantity: Math.abs(log.quantity_change || 0),
      dispatched_weight: Math.abs(log.weight_change || 0),
      dispatched_by_name: log.user ? `${log.user.first_name || ''} ${log.user.last_name || ''}`.trim() : 'Unknown',
      dispatcher_name: log.departure_order?.dispatcher ? `${log.departure_order.dispatcher.first_name || ''} ${log.departure_order.dispatcher.last_name || ''}`.trim() : 'Unknown',
      customer_name: log.departure_order?.customer?.name || 'Unknown',
      client_name: log.departure_order?.client ? 
        `${log.departure_order.client.company_name || ''} ${log.departure_order.client.first_names || ''} ${log.departure_order.client.last_name || ''}`.trim() : 
        'Unknown',
    }));

    // Get completed departure orders summary
    const departureOrdersWhere = {
      order_status: { in: ['COMPLETED'] }, // Removed 'PARTIALLY_DISPATCHED'
      dispatch_status: { in: ['DISPATCHED', 'PARTIALLY_DISPATCHED'] },
    };
    if (warehouse_id) {
      departureOrdersWhere.warehouse_id = warehouse_id;
    }

    completedDepartureOrders = await prisma.departureOrder.findMany({
      where: departureOrdersWhere,
      select: {
        departure_order_id: true,
        departure_order_no: true,
        order_status: true,
        dispatch_status: true,
        registration_date: true,
        departure_date_time: true,
        dispatched_at: true,
        destination_point: true,
        transport_type: true,
        carrier_name: true,
        total_weight: true,
        total_volume: true,
        total_pallets: true,
        
        customer: {
          select: {
            name: true,
          }
        },
        client: {
          select: {
            company_name: true,
            first_names: true,
            last_name: true,
          }
        },
        warehouse: {
          select: {
            warehouse_id: true,
            name: true,
          }
        },
        dispatcher: {
          select: {
            first_name: true,
            last_name: true,
          }
        },
        
        // Include products that were dispatched
        products: {
          select: {
            departure_order_product_id: true,
            product_code: true,
            requested_quantity: true,
            requested_packages: true,
            requested_weight: true,
            requested_pallets: true,
            presentation: true,
            requested_volume: true,
            unit_price: true,
            total_value: true,
            temperature_requirement: true,
            special_handling: true,
            delivery_instructions: true,
            product: {
              select: {
                product_id: true,
                product_code: true,
                name: true,
                manufacturer: true,
              }
            }
          }
        }
      },
      orderBy: { dispatched_at: 'desc' },
      take: 500, // Limit for performance
    });

    // Transform completed departure orders
    completedDepartureOrders = completedDepartureOrders.map(order => ({
      ...order,
      dispatcher_name: order.dispatcher ? `${order.dispatcher.first_name || ''} ${order.dispatcher.last_name || ''}`.trim() : 'Unknown',
      customer_name: order.customer?.name || 'Unknown',
      client_name: order.client ? 
        `${order.client.company_name || ''} ${order.client.first_names || ''} ${order.client.last_name || ''}`.trim() : 
        'Unknown',
      total_products: order.products.length,
      total_requested_quantity: order.products.reduce((sum, p) => sum + (p.requested_quantity || 0), 0),
      // Note: dispatched and remaining quantities are calculated from departureAllocations, not stored in DepartureOrderProduct
      total_dispatched_quantity: 0, // Will be calculated from departureAllocations if needed
      total_remaining_quantity: 0, // Will be calculated from departureAllocations if needed
      is_fully_dispatched: false, // Will be determined based on departureAllocations
      is_partially_dispatched: false, // Will be determined based on departureAllocations
    }));
  }

  // ✅ SECTION 3: PROCESS CURRENT INVENTORY with movement logs (existing functionality)
  let processedCurrentInventory = [];
  
  if (include_logs === true || include_logs === 'true') {
    processedCurrentInventory = await Promise.all(
      currentInventory.map(async (item) => {
        // Get departure order details from departure allocations
        let departureOrderDetails = null;
        if (item.allocation?.departureAllocations && item.allocation.departureAllocations.length > 0) {
          departureOrderDetails = item.allocation.departureAllocations[0].departure_order;
        }

        // Get movement logs for this inventory item
        const movementLogs = await prisma.inventoryLog.findMany({
          where: {
            OR: [
              { product_id: item.product.product_id, cell_id: item.cell.id },
              { allocation_id: item.allocation?.allocation_id },
            ],
          },
          select: {
            log_id: true,
            timestamp: true,
            movement_type: true,
            quantity_change: true,
            package_change: true,
            weight_change: true,
            volume_change: true,
            product_status: true,
            status_code: true,
            
            // Entry order information
            entry_order_id: true,
            entry_order_product_id: true,
            
            // Departure order information  
            departure_order_id: true,
            departure_order_product_id: true,
            
            // Departure order details
            departure_order: {
              select: {
                departure_order_id: true,
                departure_order_no: true,
                departure_date_time: true,
                order_status: true,
                destination_point: true,
                carrier_name: true,
                customer: {
                  select: {
                    name: true,
                  }
                }
              }
            },
            
            // Entry order details  
            entry_order: {
              select: {
                entry_order_no: true,
                registration_date: true,
              }
            },
            
            // User information
            user_id: true,
            
            // Location information (historical)
            warehouse_id: true,
            cell_id: true,
            warehouse: {
              select: {
                warehouse_id: true,
                name: true,
              }
            },
            cell: {
              select: {
                id: true,
                row: true,
                bay: true,
                position: true,
              }
            },
          },
          orderBy: { timestamp: 'desc' },
          take: 20, // Limit to last 20 movements
        });

        // Calculate movement summary
        const movementSummary = {
          total_entries: movementLogs.filter(log => log.movement_type === 'ENTRY').length,
          total_departures: movementLogs.filter(log => log.movement_type === 'DEPARTURE').length,
          total_quantity_in: movementLogs.filter(log => log.movement_type === 'ENTRY').reduce((sum, log) => sum + (log.quantity_change || 0), 0),
          total_quantity_out: Math.abs(movementLogs.filter(log => log.movement_type === 'DEPARTURE').reduce((sum, log) => sum + (log.quantity_change || 0), 0)),
          last_entry: movementLogs.find(log => log.movement_type === 'ENTRY')?.timestamp,
          last_departure: movementLogs.find(log => log.movement_type === 'DEPARTURE')?.timestamp,
        };

        // Get client information if the entry order creator is a CLIENT
        let clientInfo = null;
        if (item.allocation?.entry_order?.creator?.role?.name === 'CLIENT') {
          try {
            // Use the new ClientUser relationship
            const clientUser = await prisma.clientUser.findFirst({
              where: {
                user_id: item.allocation.entry_order.creator.id,
                is_active: true
              },
              include: {
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    mothers_last_name: true,
                    email: true,
                    phone: true,
                    address: true,
                    establishment_type: true,
                    ruc: true,
                    created_at: true
                  }
                }
              }
            });
            
            if (clientUser && clientUser.client) {
              clientInfo = clientUser.client;
            }
          } catch (error) {
            console.error('Error fetching client info for user:', item.allocation.entry_order.creator.id, error);
          }
        }

        return {
          ...item,
          cell_reference: `${item.cell.row}.${String(item.cell.bay).padStart(2, '0')}.${String(item.cell.position).padStart(2, '0')}`,
          departure_order: departureOrderDetails,
          movement_logs: movementLogs,
          movement_summary: movementSummary,
          client_info: clientInfo,
        };
      })
    );
  } else {
    // Basic current inventory without logs
    processedCurrentInventory = await Promise.all(
      currentInventory.map(async (item) => {
        let departureOrderDetails = null;
        if (item.allocation?.departureAllocations && item.allocation.departureAllocations.length > 0) {
          departureOrderDetails = item.allocation.departureAllocations[0].departure_order;
        }

        // Get client information if the entry order creator is a CLIENT
        let clientInfo = null;
        if (item.allocation?.entry_order?.creator?.role?.name === 'CLIENT') {
          try {
            // Use the new ClientUser relationship
            const clientUser = await prisma.clientUser.findFirst({
              where: {
                user_id: item.allocation.entry_order.creator.id,
                is_active: true
              },
              include: {
                client: {
                  select: {
                    client_id: true,
                    client_type: true,
                    company_name: true,
                    first_names: true,
                    last_name: true,
                    mothers_last_name: true,
                    email: true,
                    phone: true,
                    address: true,
                    establishment_type: true,
                    ruc: true,
                    created_at: true
                  }
                }
              }
            });
            
            if (clientUser && clientUser.client) {
              clientInfo = clientUser.client;
            }
          } catch (error) {
            console.error('Error fetching client info for user:', item.allocation.entry_order.creator.id, error);
          }
        }

        return {
          ...item,
          cell_reference: `${item.cell.row}.${String(item.cell.bay).padStart(2, '0')}.${String(item.cell.position).padStart(2, '0')}`,
          departure_order: departureOrderDetails,
          client_info: clientInfo,
        };
      })
    );
  }

  // ✅ SECTION 4: CREATE SIMPLIFIED MOVEMENT LOGS TABLE
  const consolidatedMovements = [];
  
  // Process each inventory item's movement logs
  processedCurrentInventory.forEach(item => {
    if (item.movement_logs && item.movement_logs.length > 0) {
      item.movement_logs.forEach(log => {
        // Calculate historical state at the time of this movement
        // For quantity and weight, we need to calculate backward from current state
        let historicalQuantity = item.current_quantity;
        let historicalWeight = parseFloat(item.current_weight) || 0;
        
        // Calculate the state before later movements by adding back future changes
        const laterMovements = item.movement_logs.filter(laterLog => 
          new Date(laterLog.timestamp) > new Date(log.timestamp)
        );
        
        for (const laterLog of laterMovements) {
          historicalQuantity -= (laterLog.quantity_change || 0);
          historicalWeight -= parseFloat(laterLog.weight_change || 0);
        }
        
        // For quality status: determine based on movement type and business rules
        let historicalQualityStatus;
        if (log.movement_type === 'ENTRY') {
          // All entries start in quarantine
          historicalQualityStatus = 'CUARENTENA';
        } else if (log.movement_type === 'TRANSFER' || log.movement_type === 'ADJUSTMENT') {
          // For transfers/adjustments, this represents a quality control transition
          // The transition shows the RESULT status (where it went TO)
          // Use the current allocation quality status as this represents the final state
          historicalQualityStatus = item.allocation.quality_status;
        } else if (log.movement_type === 'DEPARTURE') {
          // Departures can only happen from approved items
          historicalQualityStatus = 'APROBADO';
        } else {
          // Fallback to current status
          historicalQualityStatus = item.allocation.quality_status;
        }
        
        // Create movement entry with historical data
        const movement = {
          log_id: log.log_id,
          timestamp: log.timestamp,
          movement_type: log.movement_type,
          quantity_change: log.quantity_change,
          package_change: log.package_change,
          weight_change: parseFloat(log.weight_change) || 0,
          
          // Product information
          product_code: item.product.product_code,
          product_name: item.product.name,
          manufacturer: item.product.manufacturer,
          lot_series: item.allocation.entry_order_product.lot_series,
          
          // Historical location information (from the log)
          warehouse_name: log.warehouse?.name || item.warehouse.name,
          cell_reference: log.cell ? 
            `${log.cell.row}.${String(log.cell.bay).padStart(2, '0')}.${String(log.cell.position).padStart(2, '0')}` : 
            item.cell_reference,
          
          // Historical status (calculated based on business rules)
          current_quantity: historicalQuantity,
          current_weight: historicalWeight,
          quality_status: historicalQualityStatus,
          
          // Client information (from entry order)
          client_name: item.client_info?.company_name || `${item.client_info?.first_names || ''} ${item.client_info?.last_name || ''}`.trim(),
          client_email: item.client_info?.email,
          
          // Additional details
          manufacturing_date: item.allocation.entry_order_product.manufacturing_date,
          expiration_date: item.allocation.entry_order_product.expiration_date,
          notes: log.notes || null,
        };

        // Map order details based on movement type
        if (log.movement_type === 'ENTRY') {
          // For entries, map entry order details
          movement.order_no = item.allocation.entry_order.entry_order_no;
          movement.order_id = item.allocation.entry_order.entry_order_id;
          movement.order_date = item.allocation.entry_order.registration_date;
          movement.order_type = 'ENTRY';
          movement.created_by = item.allocation.entry_order.creator ? 
            `${item.allocation.entry_order.creator.first_name} ${item.allocation.entry_order.creator.last_name}` : null;
          movement.reviewed_by = item.allocation.entry_order.reviewer ? 
            `${item.allocation.entry_order.reviewer.first_name} ${item.allocation.entry_order.reviewer.last_name}` : null;
        } else if (log.movement_type === 'DEPARTURE' && log.departure_order) {
          // For departures, map departure order details
          movement.order_no = log.departure_order.departure_order_no;
          movement.order_id = log.departure_order_id;
          movement.order_date = log.departure_order.departure_date_time;
          movement.order_type = 'DEPARTURE';
          movement.order_status = log.departure_order.order_status;
          movement.destination_point = log.departure_order.destination_point;
          movement.carrier_name = log.departure_order.carrier_name;
          movement.customer_name = log.departure_order.customer?.name || null;
        } else {
          // For adjustments or entries without departure orders
          movement.order_no = item.allocation.entry_order.entry_order_no;
          movement.order_id = item.allocation.entry_order.entry_order_id;
          movement.order_date = item.allocation.entry_order.registration_date;
          movement.order_type = 'ENTRY';
        }

        consolidatedMovements.push(movement);
      });
    }
  });

  // Sort by timestamp (newest first)
  consolidatedMovements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // ✅ SECTION 5: RETURN SIMPLIFIED SUMMARY
  const summaryStats = {
    current_inventory: {
      total_items: processedCurrentInventory.length,
      total_quantity: processedCurrentInventory.reduce((sum, item) => sum + (item.current_quantity || 0), 0),
      total_weight: processedCurrentInventory.reduce((sum, item) => sum + parseFloat(item.current_weight || 0), 0),
      unique_products: [...new Set(processedCurrentInventory.map(item => item.product.product_id))].length,
      warehouses: [...new Set(processedCurrentInventory.map(item => item.warehouse.warehouse_id))].length,
    },
    movement_logs: {
      total_movements: consolidatedMovements.length,
      total_entries: consolidatedMovements.filter(m => m.movement_type === 'ENTRY').length,
      total_departures: consolidatedMovements.filter(m => m.movement_type === 'DEPARTURE').length,
      total_adjustments: consolidatedMovements.filter(m => m.movement_type === 'ADJUSTMENT').length,
      unique_products: [...new Set(consolidatedMovements.map(m => m.product_id))].length,
    }
  };

  return {
    success: true,
    summary_stats: summaryStats,
    movement_logs: consolidatedMovements,
    filters_applied: {
      warehouse_id: warehouse_id || 'ALL',
      product_id: product_id || 'ALL', 
      status: status || 'ALL',
      include_logs: include_logs,
      include_dispatch_history: include_dispatch_history,
    },
    generated_at: new Date().toISOString(),
  };
}

/** Fetch all warehouses */
async function getAllWarehouses() {
  return await prisma.warehouse.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      warehouse_id: true,
      name: true,
      location: true,
      capacity: true,
      max_occupancy: true,
    },
    orderBy: { name: "asc" },
  });
}

/** Fetch warehouse cells with optional status filter */
async function getWarehouseCells(warehouseId, statusFilter = null) {
  const where = { warehouse_id: warehouseId };
  if (statusFilter) where.status = statusFilter;

  return await prisma.warehouseCell.findMany({
    where,
    select: {
      id: true,
      row: true,
      bay: true,
      position: true,
      capacity: true,
      currentUsage: true,
      current_packaging_qty: true,
      current_weight: true,
      status: true,
      kind: true,           // ✅ FIXED: Use 'kind' instead of 'cellKind'
      cell_role: true,      // ✅ FIXED: Use 'cell_role' instead of 'cellRole'
    },
    orderBy: [{ row: "asc" }, { bay: "asc" }, { position: "asc" }],
  });
}

// ✅ NEW: Helper function to create audit log entries
async function createAuditLog(userId, action, entityType, entityId, description, oldValues, newValues, metadata) {
  await prisma.systemAuditLog.create({
    data: {
      user_id: userId,
      action: action,
      entity_type: entityType,
      entity_id: entityId,
      description: description,
      old_values: oldValues || null,
      new_values: newValues || null,
      metadata: metadata || null,
      ip_address: "127.0.0.1", // Should be extracted from request
      user_agent: "TSLogix API",
      session_id: `session-${Date.now()}`,
    },
  });
}

// ✅ NEW: Get inventory allocations in quarantine for quality control
async function getQuarantineInventory(warehouseId = null) {
  const where = {
    quality_status: "CUARENTENA",
    status: "ACTIVE"
  };

  if (warehouseId) {
    where.cell = {
      warehouse_id: warehouseId
    };
  }

  return await prisma.inventoryAllocation.findMany({
    where,
    include: {
      entry_order_product: {
        include: {
          product: {
            select: {
              product_id: true,
              product_code: true,
              name: true,
            }
          },
          entry_order: {
            select: {
              entry_order_no: true,
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
          warehouse: {
            select: {
              warehouse_id: true,
              name: true
            }
          }
        }
      },
      inventory: {
        select: {
          inventory_id: true,
          status: true,
          current_quantity: true,
        }
      },
      allocator: {
        select: {
          first_name: true,
          last_name: true,
        }
      }
    },
    orderBy: {
      allocated_at: 'asc'
    }
  });
}

// ✅ NEW: Get inventory allocations by any quality status (dynamic)
async function getInventoryByQualityStatus(qualityStatus, warehouseId = null) {
  // Validate quality status
  const validStatuses = ["CUARENTENA", "APROBADO", "DEVOLUCIONES", "CONTRAMUESTRAS", "RECHAZADOS"];
  if (!validStatuses.includes(qualityStatus)) {
    throw new Error(`Invalid quality status. Must be one of: ${validStatuses.join(", ")}`);
  }

  const where = {
    quality_status: qualityStatus,
    status: "ACTIVE",
    // ✅ FIXED: Only return allocations with positive quantities
    inventory_quantity: { gt: 0 }
  };

  if (warehouseId) {
    where.cell = {
      warehouse_id: warehouseId
    };
  }

  const allocations = await prisma.inventoryAllocation.findMany({
    where,
    include: {
      entry_order_product: {
        include: {
          product: {
            select: {
              product_id: true,
              product_code: true,
              name: true,
              manufacturer: true,
            }
          },
          entry_order: {
            select: {
              entry_order_no: true,
              registration_date: true,
              creator: {
                select: {
                  first_name: true,
                  last_name: true,
                  organisation: {
                    select: {
                      name: true
                    }
                  }
                }
              }
            }
          },
          supplier: {
            select: {
              supplier_id: true,
              name: true,
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
          warehouse: {
            select: {
              warehouse_id: true,
              name: true,
              location: true,
            }
          }
        }
      },
      inventory: {
        select: {
          inventory_id: true,
          status: true,
          current_quantity: true,
          current_package_quantity: true,
          current_weight: true,
          current_volume: true,
          created_at: true,
          last_modified_at: true,
        }
      },
      allocator: {
        select: {
          first_name: true,
          last_name: true,
        }
      },
      lastModifier: {
        select: {
          first_name: true,
          last_name: true,
        }
      }
    },
    orderBy: [
      { allocated_at: 'asc' },
      { entry_order_product: { entry_order: { registration_date: 'desc' } } }
    ]
  });

  // ✅ FIXED: Add additional filtering to ensure we only return meaningful data
  return allocations.filter(allocation => {
    // Double-check quantities are positive
    if (allocation.inventory_quantity <= 0) return false;
    
    // If inventory records exist, ensure they also have positive quantities
    if (allocation.inventory.length > 0) {
      const hasPositiveInventory = allocation.inventory.some(inv => 
        inv.current_quantity > 0 && inv.status !== 'DEPLETED'
      );
      return hasPositiveInventory;
    }
    
    // If no inventory records but allocation has positive quantity, include it
    return true;
  });
}

// ✅ NEW: Get cells filtered by quality status destination
async function getCellsByQualityStatus(qualityStatus, warehouseId = null) {
  // Map quality status to appropriate cell roles
  const statusToCellRoleMap = {
    CUARENTENA: ["STANDARD"], // Quarantine can use standard cells
    APROBADO: ["STANDARD"], // Approved can use standard cells
    DEVOLUCIONES: ["RETURNS"], // Returns need RETURNS role cells
    CONTRAMUESTRAS: ["SAMPLES"], // Samples need SAMPLES role cells
    RECHAZADOS: ["REJECTED", "DAMAGED"], // Rejected can use REJECTED or DAMAGED cells
  };

  const allowedRoles = statusToCellRoleMap[qualityStatus] || ["STANDARD"];
  
  const where = {
    status: "AVAILABLE",
    cell_role: { in: allowedRoles }
  };

  if (warehouseId) {
    where.warehouse_id = warehouseId;
  }

  const cells = await prisma.warehouseCell.findMany({
    where,
    select: {
      id: true,
      row: true,
      bay: true,
      position: true,
      capacity: true,
      currentUsage: true,
      current_packaging_qty: true,
      current_weight: true,
      status: true,
      kind: true,
      cell_role: true,
      warehouse: {
        select: {
          warehouse_id: true,
          name: true,
        }
      }
    },
    orderBy: [{ row: "asc" }, { bay: "asc" }, { position: "asc" }],
  });

  return cells.map(cell => ({
    ...cell,
    cell_reference: `${cell.row}.${String(cell.bay).padStart(2, "0")}.${String(cell.position).padStart(2, "0")}`,
    role_description: {
      STANDARD: "Standard Storage",
      RETURNS: "Returns Area",
      SAMPLES: "Sample Storage", 
      REJECTED: "Rejected Items",
      DAMAGED: "Damaged Items",
      EXPIRED: "Expired Items"
    }[cell.cell_role]
  }));
}

// ✅ UPDATED: Enhanced transition function with PARTIAL TRANSITIONS and FULL BIDIRECTIONAL support
// Supports all quality status transitions including:
// - CUARENTENA ↔ APROBADO ↔ RECHAZADOS ↔ DEVOLUCIONES ↔ CONTRAMUESTRAS
// - Any status can transition to any other status with proper cell assignment
// - CONTRAMUESTRAS fully supported from/to all statuses
async function transitionQualityStatus(transitionData) {
  const {
    allocation_id,
    to_status,
    quantity_to_move,
    package_quantity_to_move,
    weight_to_move,
    volume_to_move,
    reason,
    notes,
    new_cell_id, // ✅ REQUIRED for non-approved transitions
    performed_by
  } = transitionData;

  // ✅ FIXED: Validate and clean up input data to avoid NaN values
  const cleanQuantityToMove = parseInt(quantity_to_move) || 0;
  let cleanPackageQuantityToMove = package_quantity_to_move ? parseInt(package_quantity_to_move) : null;
  let cleanWeightToMove = weight_to_move ? parseFloat(weight_to_move) : null;
  let cleanVolumeToMove = volume_to_move ? parseFloat(volume_to_move) : null;

  // Validate required fields
  if (!allocation_id || !to_status || cleanQuantityToMove <= 0 || !performed_by || !reason) {
    throw new Error("Missing or invalid required fields: allocation_id, to_status, quantity_to_move, performed_by, reason");
  }

  // ✅ UPDATED: Validate cell requirement for special quality statuses (bidirectional support)
  // Note: Cell requirements will be validated inside the transaction after fetching allocation data
  
  // ✅ NOTE: Cell validation for transitions FROM special statuses will be handled inside the transaction

  // ✅ NEW: Helper function to validate transition compatibility
  const validateTransitionCompatibility = (from_status, to_status) => {
    // ✅ NEW: Define allowed transitions based on new business rules
    const allowedTransitions = {
      CUARENTENA: ["APROBADO", "RECHAZADOS", "DEVOLUCIONES", "CONTRAMUESTRAS"],
      APROBADO: ["CUARENTENA", "RECHAZADOS", "DEVOLUCIONES", "CONTRAMUESTRAS"],
      RECHAZADOS: [], // ✅ RECHAZADOS is a final state - no transitions allowed
      DEVOLUCIONES: ["RECHAZADOS", "APROBADO"], // ✅ Can only go to RECHAZADOS or APROBADOS
      CONTRAMUESTRAS: ["CUARENTENA", "APROBADO", "RECHAZADOS", "DEVOLUCIONES"] // ✅ Can go to all other states
    };
    
    // Check if the transition is allowed
    const validTargets = allowedTransitions[from_status] || [];
    
    if (!validTargets.includes(to_status)) {
      const statusNames = {
        CUARENTENA: "Cuarentena",
        APROBADO: "Aprobado", 
        RECHAZADOS: "Rechazados",
        DEVOLUCIONES: "Devoluciones",
        CONTRAMUESTRAS: "Contramuestras"
      };
      
      if (from_status === "RECHAZADOS") {
        throw new Error(`Products in ${statusNames[from_status]} status cannot be transitioned to any other status. This is a final state.`);
      }
      
      const allowedStatusNames = validTargets.map(status => statusNames[status]).join(", ");
      throw new Error(`Transition from ${statusNames[from_status]} to ${statusNames[to_status]} is not allowed. Valid transitions from ${statusNames[from_status]} are: ${allowedStatusNames}`);
    }
    
    // Log transition for audit purposes  
    console.log(`✅ Validated transition: ${from_status} → ${to_status}`);
    
    // ✅ NEW: Special logging for business rule transitions
    if (from_status === "RECHAZADOS") {
      console.log(`❌ BLOCKED: RECHAZADOS is a final state - no transitions allowed`);
    } else if (from_status === "DEVOLUCIONES" && !["RECHAZADOS", "APROBADO"].includes(to_status)) {
      console.log(`❌ BLOCKED: DEVOLUCIONES can only transition to RECHAZADOS or APROBADO`);
    } else if (to_status === "CONTRAMUESTRAS") {
      console.log(`📋 CONTRAMUESTRAS transition: Moving TO sample status from ${from_status}`);
    } else if (from_status === "CONTRAMUESTRAS") {
      console.log(`📋 CONTRAMUESTRAS transition: Moving FROM sample status to ${to_status}`);
    }
    
    return true;
  };

  return await prisma.$transaction(async (tx) => {
    // 1. Get current allocation
    const allocation = await tx.inventoryAllocation.findUnique({
      where: { allocation_id },
      include: {
        inventory: true,
        entry_order_product: {
          include: { product: true }
        },
        cell: {
          include: { warehouse: true }
        }
      }
    });

    if (!allocation) {
      throw new Error("Allocation not found");
    }

    // ✅ UPDATED: Allow transitions between all quality statuses (two-way transitions)
    const validFromStatuses = ["CUARENTENA", "APROBADO", "DEVOLUCIONES", "CONTRAMUESTRAS", "RECHAZADOS"];
    if (!validFromStatuses.includes(allocation.quality_status)) {
      throw new Error(`Invalid source quality status: ${allocation.quality_status}. Cannot transition from this status.`);
    }

    // ✅ NEW: Validate the requested transition compatibility
    validateTransitionCompatibility(allocation.quality_status, to_status);

    // ✅ NEW: Validate cell requirements for special quality statuses
    const specialStatuses = ["DEVOLUCIONES", "CONTRAMUESTRAS", "RECHAZADOS"];
    
    // ✅ NEW: Handle bidirectional transitions - cell required when moving TO special statuses from any status
    if (specialStatuses.includes(to_status) && !new_cell_id) {
      throw new Error(`Cell assignment required when transitioning to ${to_status}. Please select an appropriate cell.`);
    }
    
    // ✅ NEW: When transitioning FROM special statuses back to APROBADO, new cell is recommended but not required
    if (specialStatuses.includes(allocation.quality_status) && to_status === "APROBADO" && !new_cell_id) {
      console.log(`⚠️  WARNING: Transitioning from ${allocation.quality_status} to APROBADO without cell reassignment. Items will remain in current cell.`);
    }

    // ✅ NEW: Validate destination cell role if new cell provided
    if (new_cell_id) {
      const destinationCell = await tx.warehouseCell.findUnique({
        where: { id: new_cell_id },
        include: { warehouse: true }
      });

      if (!destinationCell) {
        throw new Error("Destination cell not found");
      }

      if (destinationCell.status !== "AVAILABLE") {
        throw new Error("Destination cell is not available");
      }

      // Validate cell role matches quality status
      const requiredRoles = {
        DEVOLUCIONES: ["RETURNS"],
        CONTRAMUESTRAS: ["SAMPLES"], 
        RECHAZADOS: ["REJECTED", "DAMAGED"],
        APROBADO: ["STANDARD"],
        CUARENTENA: ["STANDARD"] // ✅ UPDATED: Quarantine can use standard cells
      };

      const allowedRoles = requiredRoles[to_status] || ["STANDARD"];
      if (!allowedRoles.includes(destinationCell.cell_role)) {
        const roleNames = {
          RETURNS: "Returns",
          SAMPLES: "Samples", 
          REJECTED: "Rejected",
          DAMAGED: "Damaged",
          STANDARD: "Standard"
        };
        
        const expectedRoleNames = allowedRoles.map(role => roleNames[role]).join(" or ");
        const actualRoleName = roleNames[destinationCell.cell_role];
        
        throw new Error(`Invalid cell role for ${to_status}. Expected ${expectedRoleNames} cell, but selected ${actualRoleName} cell.`);
      }
    }

    // 2. Validate quantities (existing validation logic)
    if (cleanQuantityToMove > allocation.inventory_quantity) {
      throw new Error(`Cannot move more than available quantity. Available: ${allocation.inventory_quantity}, Requested: ${cleanQuantityToMove}`);
    }

    // ✅ FIXED: Calculate proportional quantities with proper synchronization
    const proportionRatio = cleanQuantityToMove / allocation.inventory_quantity;
    
    // Calculate package quantity with proper ratio
    if (!cleanPackageQuantityToMove) {
      const originalPackageRatio = allocation.package_quantity > 0 ? 
        allocation.package_quantity / allocation.inventory_quantity : 1;
      cleanPackageQuantityToMove = Math.ceil(cleanQuantityToMove * originalPackageRatio);
    }
    
    // Calculate weight with proper ratio
    if (!cleanWeightToMove) {
      cleanWeightToMove = parseFloat(allocation.weight_kg) * proportionRatio;
    }
    
    // Calculate volume with proper ratio
    if (!cleanVolumeToMove && allocation.volume_m3) {
      cleanVolumeToMove = parseFloat(allocation.volume_m3) * proportionRatio;
    }



    // ✅ NEW: Calculate remaining quantities that will stay in original allocation
    const remainingQuantity = allocation.inventory_quantity - cleanQuantityToMove;
    const remainingPackages = allocation.package_quantity - cleanPackageQuantityToMove;
    const remainingWeight = parseFloat(allocation.weight_kg) - cleanWeightToMove;
    const remainingVolume = allocation.volume_m3 ? parseFloat(allocation.volume_m3) - (cleanVolumeToMove || 0) : null;

    // ✅ NEW: Determine if this is a FULL or PARTIAL transition
    const isFullTransition = (remainingQuantity === 0);
    const finalCellId = new_cell_id || allocation.cell_id;

    // 3. ✅ NEW: Create quality control transition record
    const transition = await tx.qualityControlTransition.create({
      data: {
        allocation_id,
        inventory_id: allocation.inventory[0]?.inventory_id,
        from_status: allocation.quality_status, // ✅ UPDATED: Use actual current status
        to_status,
        quantity_moved: cleanQuantityToMove,
        package_quantity_moved: cleanPackageQuantityToMove,
        weight_moved: cleanWeightToMove,
        volume_moved: cleanVolumeToMove,
        from_cell_id: allocation.cell_id,
        to_cell_id: finalCellId,
        performed_by,
        reason,
        notes: notes || `${isFullTransition ? 'Full' : 'Partial'} quality transition from ${allocation.quality_status} to ${to_status} - ${cleanQuantityToMove} units, ${cleanPackageQuantityToMove} packages, ${cleanWeightToMove} kg${new_cell_id ? ` - Moved to new cell` : ' - Same cell'}`
      }
    });

    let newAllocation = null;
    let newInventory = null;

    if (isFullTransition) {
      // ✅ FULL TRANSITION: Update existing allocation completely
      
      // 4a. Handle cell movement for full transition
      if (new_cell_id && new_cell_id !== allocation.cell_id) {
        // Remove from old cell
        await tx.warehouseCell.update({
          where: { id: allocation.cell_id },
          data: {
            current_packaging_qty: { decrement: allocation.package_quantity },
            current_weight: { decrement: parseFloat(allocation.weight_kg) },
            currentUsage: allocation.volume_m3 ? { decrement: parseFloat(allocation.volume_m3) } : undefined,
          }
        });

        // Add to new cell
        await tx.warehouseCell.update({
          where: { id: new_cell_id },
          data: {
            status: "OCCUPIED",
            current_packaging_qty: { increment: allocation.package_quantity },
            current_weight: { increment: parseFloat(allocation.weight_kg) },
            currentUsage: allocation.volume_m3 ? { increment: parseFloat(allocation.volume_m3) } : undefined,
          }
        });

        // Update inventory record with new cell
        if (allocation.inventory.length > 0) {
          await tx.inventory.update({
            where: { inventory_id: allocation.inventory[0].inventory_id },
            data: {
              cell_id: new_cell_id,
            }
          });
        }
      }

      // 5a. Update existing allocation with new status
      await tx.inventoryAllocation.update({
        where: { allocation_id },
        data: {
          quality_status: to_status,
          cell_id: finalCellId,
          last_modified_by: performed_by,
          last_modified_at: new Date(),
          observations: `${allocation.observations || ''}\nFull quality transition: ${reason} - All ${cleanQuantityToMove} units moved from ${allocation.quality_status} to ${to_status}${new_cell_id ? ' with cell reassignment' : ''}`
        }
      });

      // 6a. Update inventory status
      if (allocation.inventory.length > 0) {
        const newInventoryStatus = to_status === "APROBADO" ? "AVAILABLE" :
                                  to_status === "RECHAZADOS" ? "DAMAGED" :
                                  to_status === "CONTRAMUESTRAS" ? "SAMPLING" :
                                  to_status === "DEVOLUCIONES" ? "RETURNED" :
                                  to_status === "CUARENTENA" ? "QUARANTINED" : "RETURNED";

        await tx.inventory.update({
          where: { inventory_id: allocation.inventory[0].inventory_id },
          data: {
            quality_status: to_status,
            status: newInventoryStatus,
            last_modified_by: performed_by,
            last_modified_at: new Date()
          }
        });
      }

    } else {
      // ✅ PARTIAL TRANSITION: Create new allocation for moved portion, update original for remaining
      
      // 4b. Create NEW allocation for the transitioned portion
      newAllocation = await tx.inventoryAllocation.create({
        data: {
          entry_order_id: allocation.entry_order_id,
          entry_order_product_id: allocation.entry_order_product_id,
          inventory_quantity: cleanQuantityToMove,
          package_quantity: cleanPackageQuantityToMove,
          quantity_pallets: Math.ceil(cleanPackageQuantityToMove / 20),
          presentation: allocation.presentation,
          weight_kg: cleanWeightToMove,
          volume_m3: cleanVolumeToMove,
          cell_id: finalCellId,
          product_status: allocation.product_status,
          status_code: allocation.status_code,
          quality_status: to_status, // ✅ NEW STATUS
          guide_number: allocation.guide_number,
          uploaded_documents: allocation.uploaded_documents,
          observations: `Partial transition from allocation ${allocation_id}. Moved ${cleanQuantityToMove} units to ${to_status}. Reason: ${reason}`,
          allocated_by: allocation.allocated_by,
          allocated_at: allocation.allocated_at,
          last_modified_by: performed_by,
          last_modified_at: new Date(),
          status: "ACTIVE"
        }
      });

      // 5b. Create NEW inventory record for the transitioned portion
      const newInventoryStatus = to_status === "APROBADO" ? "AVAILABLE" :
                                to_status === "RECHAZADOS" ? "DAMAGED" :
                                to_status === "CONTRAMUESTRAS" ? "RESERVED" :
                                to_status === "DEVOLUCIONES" ? "RETURNED" :
                                to_status === "CUARENTENA" ? "QUARANTINED" : "RETURNED";

      newInventory = await tx.inventory.create({
        data: {
          allocation_id: newAllocation.allocation_id,
          product_id: allocation.entry_order_product.product.product_id,
          cell_id: finalCellId,
          warehouse_id: allocation.inventory[0]?.warehouse_id,
          current_quantity: cleanQuantityToMove,
          current_package_quantity: cleanPackageQuantityToMove,
          current_weight: cleanWeightToMove,
          current_volume: cleanVolumeToMove,
          status: newInventoryStatus,
          product_status: allocation.product_status,
          status_code: allocation.status_code,
          quality_status: to_status, // ✅ NEW STATUS
          created_by: performed_by,
          last_modified_by: performed_by,
          last_modified_at: new Date()
        }
      });

      // 6b. Update ORIGINAL allocation to reduce quantities (remaining portion stays in CUARENTENA)
      await tx.inventoryAllocation.update({
        where: { allocation_id },
        data: {
          inventory_quantity: remainingQuantity,
          package_quantity: remainingPackages,
          weight_kg: remainingWeight,
          volume_m3: remainingVolume,
          last_modified_by: performed_by,
          last_modified_at: new Date(),
          observations: `${allocation.observations || ''}\nPartial transition: ${cleanQuantityToMove} units moved to ${to_status}. Remaining ${remainingQuantity} units stay in ${allocation.quality_status}. Reason: ${reason}`
        }
      });

      // 7b. Update ORIGINAL inventory to reduce quantities (remaining portion stays in CUARENTENA)
      if (allocation.inventory.length > 0) {
        await tx.inventory.update({
          where: { inventory_id: allocation.inventory[0].inventory_id },
          data: {
            current_quantity: remainingQuantity,
            current_package_quantity: remainingPackages,
            current_weight: remainingWeight,
            current_volume: remainingVolume,
            last_modified_by: performed_by,
            last_modified_at: new Date()
          }
        });
      }

      // 8b. Handle cell assignments for partial transition
      if (new_cell_id && new_cell_id !== allocation.cell_id) {
        // Remove transitioned quantities from original cell
        await tx.warehouseCell.update({
          where: { id: allocation.cell_id },
          data: {
            current_packaging_qty: { decrement: cleanPackageQuantityToMove },
            current_weight: { decrement: cleanWeightToMove },
            currentUsage: cleanVolumeToMove ? { decrement: cleanVolumeToMove } : undefined,
          }
        });

        // Add transitioned quantities to new cell
        await tx.warehouseCell.update({
          where: { id: new_cell_id },
          data: {
            status: "OCCUPIED",
            current_packaging_qty: { increment: cleanPackageQuantityToMove },
            current_weight: { increment: cleanWeightToMove },
            currentUsage: cleanVolumeToMove ? { increment: cleanVolumeToMove } : undefined,
          }
        });
      } else {
        // If same cell, just adjust the quantities (no movement needed since both portions stay in same cell)
        // The cell quantities don't change because both portions are still in the same cell
      }
    }

    // 9. ✅ Create inventory log for the transition
    await tx.inventoryLog.create({
      data: {
        user_id: performed_by,
        product_id: allocation.entry_order_product.product.product_id,
        movement_type: new_cell_id && new_cell_id !== allocation.cell_id ? "TRANSFER" : "ADJUSTMENT",
        quantity_change: isFullTransition ? -cleanQuantityToMove : 0, // For partial, we're not removing, just splitting
        package_change: isFullTransition ? -cleanPackageQuantityToMove : 0,
        weight_change: isFullTransition ? -cleanWeightToMove : 0,
        volume_change: (isFullTransition && cleanVolumeToMove) ? -cleanVolumeToMove : null,
        allocation_id: newAllocation ? newAllocation.allocation_id : allocation.allocation_id,
        warehouse_id: allocation.inventory[0]?.warehouse_id,
        cell_id: finalCellId,
        product_status: allocation.product_status,
        status_code: allocation.status_code,
        notes: `${isFullTransition ? 'Full' : 'Partial'} quality transition: ${cleanQuantityToMove} units (${cleanPackageQuantityToMove} packages, ${cleanWeightToMove} kg) ${isFullTransition ? 'moved' : 'split'} from ${allocation.quality_status} to ${to_status}. Reason: ${reason}.${isFullTransition ? '' : ` Remaining ${remainingQuantity} units stay in ${allocation.quality_status}.`}${new_cell_id && new_cell_id !== allocation.cell_id ? ` Cell: ${allocation.cell.row}.${allocation.cell.bay}.${allocation.cell.position} → New cell` : ' Same cell'}`,
      },
    });

    // 10. Create audit log
    await createAuditLog(
      performed_by,
      "QUALITY_STATUS_CHANGED",
      "QualityControlTransition",
      transition.transition_id,
      `${isFullTransition ? 'Full' : 'Partial'} quality status transition: ${cleanQuantityToMove} units (${cleanPackageQuantityToMove} packages, ${cleanWeightToMove} kg) of ${allocation.entry_order_product.product.name} from ${allocation.quality_status} to ${to_status}${new_cell_id ? ' with cell reassignment' : ''}`,
              { 
          quality_status: allocation.quality_status, // ✅ UPDATED: Use actual current status
          quantity: allocation.inventory_quantity,
          packages: allocation.package_quantity,
          weight: parseFloat(allocation.weight_kg),
          cell_id: allocation.cell_id
        },
      { 
        quality_status: to_status,
        quantity: cleanQuantityToMove,
        packages: cleanPackageQuantityToMove,
        weight: cleanWeightToMove,
        cell_id: finalCellId,
                  remaining_in_original_status: isFullTransition ? 0 : remainingQuantity
      },
      {
        allocation_id,
        new_allocation_id: newAllocation?.allocation_id,
        product_code: allocation.entry_order_product.product.product_code,
        from_cell: `${allocation.cell.row}.${allocation.cell.bay}.${allocation.cell.position}`,
        to_cell: new_cell_id ? `New cell assigned` : `Same cell`,
        reason,
        quantity_moved: cleanQuantityToMove,
        packages_moved: cleanPackageQuantityToMove,
        weight_moved: cleanWeightToMove,
        is_full_transition: isFullTransition,
        remaining_quantity: isFullTransition ? 0 : remainingQuantity,
        cell_reassigned: !!new_cell_id
      }
    );

    return {
      transition,
      original_allocation: allocation,
      new_allocation: newAllocation,
      new_inventory: newInventory,
      is_full_transition: isFullTransition,
      cell_moved: !!new_cell_id,
      destination_cell_id: finalCellId,
      quantities_transitioned: {
        quantity: cleanQuantityToMove,
        packages: cleanPackageQuantityToMove,
        weight: cleanWeightToMove,
        volume: cleanVolumeToMove
      },
      quantities_remaining: isFullTransition ? null : {
        quantity: remainingQuantity,
        packages: remainingPackages,
        weight: remainingWeight,
        volume: remainingVolume
      },
      new_status: to_status,
      cellReference: new_cell_id ? `New cell assigned` : `${allocation.cell.row}.${allocation.cell.bay}.${allocation.cell.position}`
    };
  });
}

// ✅ NEW: Get available inventory for departure (only approved items)
async function getAvailableInventoryForDeparture(filters = {}) {
  const { warehouse_id, product_id } = filters;

  const where = {
    quality_status: "APROBADO", // Only approved inventory
    status: "AVAILABLE",
    current_quantity: { gt: 0 }
  };

  if (warehouse_id) where.warehouse_id = warehouse_id;
  if (product_id) where.product_id = product_id;

  return await prisma.inventory.findMany({
    where,
    include: {
      product: {
        select: {
          product_id: true,
          product_code: true,
          name: true,
        }
      },
      cell: {
        select: {
          row: true,
          bay: true,
          position: true,
        }
      },
      warehouse: {
        select: {
          warehouse_id: true,
          name: true,
        }
      },
      allocation: {
        select: {
          allocation_id: true,
          guide_number: true,
          entry_order_product: {
            select: {
              lot_series: true,
              expiration_date: true,
              entry_order: {
                select: {
                  entry_order_no: true,
                }
              }
            }
          }
        }
      }
    },
    orderBy: [
      { warehouse: { name: "asc" } },
      { product: { product_code: "asc" } },
      { allocation: { entry_order_product: { expiration_date: "asc" } } } // FIFO
    ]
  });
}

// ✅ UPDATED: Get inventory movement logs with enhanced filtering including dispatch and entry orders
async function getInventoryAuditTrail(filters = {}) {
  // ✅ OPTIMIZED: Import pagination utilities
  const { getCursorPaginatedResults, buildSearchConditions, buildDateRangeConditions, buildStatusConditions } = require('../../utils/pagination');

  const { 
    movement_type,
    entry_order_id,
    departure_order_id,
    product_id,
    warehouse_id,
    cell_id,
    user_id,
    date_from,
    date_to,
    cursor,
    pageSize = 50,
    search
  } = filters;

  // Build where clause for filtering
  const where = {};

  // ✅ NEW: Filter by movement type (ENTRY, DEPARTURE, ADJUSTMENT, etc.)
  if (movement_type) {
    where.movement_type = movement_type;
  }

  // ✅ NEW: Filter by entry order
  if (entry_order_id) {
    where.entry_order_id = entry_order_id;
  }

  // ✅ NEW: Filter by departure order
  if (departure_order_id) {
    where.departure_order_id = departure_order_id;
  }

  // ✅ NEW: Filter by product
  if (product_id) {
    where.product_id = product_id;
  }

  // ✅ NEW: Filter by warehouse
  if (warehouse_id) {
    where.warehouse_id = warehouse_id;
  }

  // ✅ NEW: Filter by cell
  if (cell_id) {
    where.cell_id = cell_id;
  }

  // ✅ NEW: Filter by user
  if (user_id) {
    where.user_id = user_id;
  }

  // ✅ OPTIMIZED: Use utility functions for date range and search
  const dateConditions = buildDateRangeConditions(date_from, date_to, 'timestamp');
  const searchConditions = buildSearchConditions(search, ['notes']);

  // Merge all conditions
  const finalWhereClause = {
    ...where,
    ...dateConditions,
    ...searchConditions
  };

  // ✅ OPTIMIZED: Use cursor-based pagination
  const paginationResult = await getCursorPaginatedResults({
    model: 'inventoryLog',
    where: finalWhereClause,
    include: {
      user: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          role: {
            select: {
              name: true
            }
          }
        }
      },
      product: {
        select: {
          product_id: true,
          product_code: true,
          name: true,
          manufacturer: true
        }
      },
      entry_order: {
        select: {
          entry_order_id: true,
          entry_order_no: true,
          registration_date: true,
          creator: {
            select: {
              first_name: true,
              last_name: true
            }
          }
        }
      },
      entry_order_product: {
        select: {
          entry_order_product_id: true,
          lot_series: true,
          expiration_date: true,
          manufacturing_date: true
        }
      },
      departure_order: {
        select: {
          departure_order_id: true,
          departure_order_no: true,
          departure_date_time: true,
          order_status: true,
          destination_point: true,
          transport_type: true
        }
      },
      departure_order_product: {
        select: {
          departure_order_product_id: true,
          requested_quantity: true,
          requested_weight: true
        }
      },
      warehouse: {
        select: {
          warehouse_id: true,
          name: true,
          location: true
        }
      },
      cell: {
        select: {
          id: true,
          row: true,
          bay: true,
          position: true
        }
      },
      allocation: {
        select: {
          allocation_id: true,
          quality_status: true,
          product_status: true
        }
      }
    },
    cursor,
    pageSize,
    cursorField: 'log_id',
    sortOrder: 'desc',
    orderBy: {
      timestamp: 'desc'
    }
  });

  if (!paginationResult.success) {
    throw new Error(paginationResult.error);
  }

  const logs = paginationResult.data;

  // Transform logs with additional computed fields
  const transformedLogs = logs.map(log => ({
    ...log,
    cell_reference: log.cell ? `${log.cell.row}.${String(log.cell.bay).padStart(2, '0')}.${String(log.cell.position).padStart(2, '0')}` : null,
    user_name: log.user ? `${log.user.first_name} ${log.user.last_name}` : null,
    user_role: log.user?.role?.name || null,
    product_name: log.product?.name || null,
    product_code: log.product?.product_code || null,
    entry_order_no: log.entry_order?.entry_order_no || null,
    departure_order_no: log.departure_order?.departure_order_no || null,
    
    // Movement type classifications
    is_entry: log.movement_type === 'ENTRY',
    is_departure: log.movement_type === 'DEPARTURE',
    is_adjustment: log.movement_type === 'ADJUSTMENT',
    is_transfer: log.movement_type === 'TRANSFER',
    is_inbound: log.quantity_change > 0,
    is_outbound: log.quantity_change < 0,
    
    // Absolute values for calculations
    quantity_abs: Math.abs(log.quantity_change),
    weight_abs: Math.abs(parseFloat(log.weight_change))
  }));

  return {
    logs: transformedLogs,
    pagination: paginationResult.pagination,
    filters_applied: {
      movement_type,
      entry_order_id,
      departure_order_id,
      product_id,
      warehouse_id,
      cell_id,
      user_id,
      date_from,
      date_to,
      search
    },
    summary: {
      total_logs: transformedLogs.length,
      entry_movements: transformedLogs.filter(log => log.is_entry).length,
      departure_movements: transformedLogs.filter(log => log.is_departure).length,
      adjustment_movements: transformedLogs.filter(log => log.is_adjustment).length,
      total_inbound_quantity: transformedLogs.filter(log => log.is_inbound).reduce((sum, log) => sum + log.quantity_abs, 0),
      total_outbound_quantity: transformedLogs.filter(log => log.is_outbound).reduce((sum, log) => sum + log.quantity_abs, 0),
      total_inbound_weight: transformedLogs.filter(log => log.is_inbound).reduce((sum, log) => sum + log.weight_abs, 0),
      total_outbound_weight: transformedLogs.filter(log => log.is_outbound).reduce((sum, log) => sum + log.weight_abs, 0)
    }
  };
}

// ✅ NEW: Validate synchronization across the entire inventory system
async function validateInventorySynchronization(options = {}) {
  const { autoFix = false, warehouseId = null } = options;
  
  const issues = [];
  const fixes = [];
  
  try {
    // 1. Check EntryOrderProduct sync
    console.log("🔍 Checking EntryOrderProduct synchronization...");
    const entryProducts = await prisma.entryOrderProduct.findMany({
      where: warehouseId ? {
        entry_order: { warehouse_id: warehouseId }
      } : {},
      include: {
        entry_order: true,
        product: true,
        inventoryAllocations: true
      }
    });
    
    for (const entryProduct of entryProducts) {
      // Check if allocations exceed entry product quantities
      const totalAllocatedQty = entryProduct.inventoryAllocations.reduce((sum, alloc) => sum + alloc.inventory_quantity, 0);
      const totalAllocatedPkg = entryProduct.inventoryAllocations.reduce((sum, alloc) => sum + alloc.package_quantity, 0);
      const totalAllocatedWeight = entryProduct.inventoryAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.weight_kg), 0);
      
      if (totalAllocatedQty > entryProduct.inventory_quantity) {
        issues.push({
          type: "OVER_ALLOCATION",
          entity: "EntryOrderProduct",
          id: entryProduct.entry_order_product_id,
          issue: `Allocated quantity (${totalAllocatedQty}) exceeds entry quantity (${entryProduct.inventory_quantity})`,
          severity: "HIGH"
        });
      }
      
      if (totalAllocatedPkg > entryProduct.package_quantity) {
        issues.push({
          type: "OVER_ALLOCATION_PACKAGES",
          entity: "EntryOrderProduct", 
          id: entryProduct.entry_order_product_id,
          issue: `Allocated packages (${totalAllocatedPkg}) exceeds entry packages (${entryProduct.package_quantity})`,
          severity: "HIGH"
        });
      }
      

    }
    
    // 2. Check InventoryAllocation vs Inventory sync
    console.log("🔍 Checking InventoryAllocation vs Inventory synchronization...");
    const allocations = await prisma.inventoryAllocation.findMany({
      where: warehouseId ? {
        inventory: { some: { warehouse_id: warehouseId } }
      } : {},
      include: {
        inventory: true
      }
    });
    
    for (const allocation of allocations) {
      for (const inventory of allocation.inventory) {
        // Check quantity sync
        if (inventory.current_quantity > allocation.inventory_quantity) {
          issues.push({
            type: "INVENTORY_QUANTITY_MISMATCH",
            entity: "Inventory",
            id: inventory.inventory_id,
            issue: `Inventory current_quantity (${inventory.current_quantity}) exceeds allocation quantity (${allocation.inventory_quantity})`,
            severity: "MEDIUM"
          });
        }
        
        // Check package sync
        if (inventory.current_package_quantity > allocation.package_quantity) {
          issues.push({
            type: "INVENTORY_PACKAGE_MISMATCH", 
            entity: "Inventory",
            id: inventory.inventory_id,
            issue: `Inventory packages (${inventory.current_package_quantity}) exceeds allocation packages (${allocation.package_quantity})`,
            severity: "MEDIUM"
          });
        }
        
        
      }
    }
    
    // 3. Check WarehouseCell sync with contained inventory
    console.log("🔍 Checking WarehouseCell synchronization...");
    const cells = await prisma.warehouseCell.findMany({
      where: warehouseId ? { warehouse_id: warehouseId } : {},
      include: {
        inventory: true
      }
    });
    
    for (const cell of cells) {
      const totalCellPackages = cell.inventory.reduce((sum, inv) => sum + inv.current_package_quantity, 0);
      const totalCellWeight = cell.inventory.reduce((sum, inv) => sum + parseFloat(inv.current_weight), 0);
      
      // Check package sync
      if (Math.abs(cell.current_packaging_qty - totalCellPackages) > 1) {
        issues.push({
          type: "CELL_PACKAGE_MISMATCH",
          entity: "WarehouseCell",
          id: cell.id,
          issue: `Cell packages (${cell.current_packaging_qty}) doesn't match inventory total (${totalCellPackages})`,
          severity: "LOW",
          autoFixable: true
        });
        
        if (autoFix) {
          await prisma.warehouseCell.update({
            where: { id: cell.id },
            data: { current_packaging_qty: totalCellPackages }
          });
          fixes.push(`Fixed cell ${cell.row}.${cell.bay}.${cell.position} package count: ${cell.current_packaging_qty} → ${totalCellPackages}`);
        }
      }
      

    }
    
    // 4. Check for orphaned records
    console.log("🔍 Checking for orphaned records...");
    
    // Inventory without allocations
    const orphanedInventory = await prisma.inventory.findMany({
      where: {
        allocation_id: null,
        ...(warehouseId && { warehouse_id: warehouseId })
      }
    });
    
    if (orphanedInventory.length > 0) {
      issues.push({
        type: "ORPHANED_INVENTORY",
        entity: "Inventory",
        count: orphanedInventory.length,
        issue: `Found ${orphanedInventory.length} inventory records without allocations`,
        severity: "MEDIUM"
      });
    }
    
    const summary = {
      totalIssues: issues.length,
      highSeverity: issues.filter(i => i.severity === "HIGH").length,
      mediumSeverity: issues.filter(i => i.severity === "MEDIUM").length,
      lowSeverity: issues.filter(i => i.severity === "LOW").length,
      autoFixesApplied: fixes.length,
      issues,
      fixes
    };
    
    console.log(`✅ Synchronization check complete: ${summary.totalIssues} issues found`);
    
    return summary;
    
  } catch (error) {
    console.error("❌ Error during synchronization validation:", error);
    throw new Error(`Synchronization validation failed: ${error.message}`);
  }
}

// ✅ NEW: Get warehouse information for an entry order
async function getEntryOrderWarehouse(entryOrderId) {
  try {
    const entryOrder = await prisma.entryOrder.findUnique({
      where: { entry_order_id: entryOrderId },
      select: {
        entry_order_id: true,
        entry_order_no: true,
        warehouse_id: true,
        warehouse: {
          select: {
            warehouse_id: true,
            name: true,
            location: true,
            status: true
          }
        }
      }
    });

    if (!entryOrder) {
      throw new Error(`Entry order with ID ${entryOrderId} not found`);
    }

    return {
      entry_order_id: entryOrder.entry_order_id,
      entry_order_no: entryOrder.entry_order_no,
      warehouse_id: entryOrder.warehouse_id,
      warehouse: entryOrder.warehouse,
      has_warehouse_assigned: !!entryOrder.warehouse_id,
      message: entryOrder.warehouse_id 
        ? `Entry order is assigned to ${entryOrder.warehouse.name}`
        : "Entry order has no warehouse assigned yet"
    };
  } catch (error) {
    console.error("Error in getEntryOrderWarehouse:", error);
    throw new Error(`Failed to get entry order warehouse: ${error.message}`);
  }
}

// ✅ NEW: Get comprehensive allocation helper information for an entry order
async function getEntryOrderAllocationHelper(entryOrderId, userRole = null, userId = null) {
  try {
    // 1. Get entry order with all product details
    const entryOrder = await prisma.entryOrder.findUnique({
      where: { 
        entry_order_id: entryOrderId,
        review_status: "APPROVED" 
      },
      include: {
        warehouse: {
          select: {
            warehouse_id: true,
            name: true,
            location: true
          }
        },
        creator: {
          select: {
            id: true,
            role: { select: { name: true } }
          }
        },
        products: {
          include: {
            product: {
              select: {
                product_id: true,
                product_code: true,
                name: true,
                manufacturer: true,
                temperature_range: true
              }
            },
            supplier: {
              select: {
                supplier_id: true,
                company_name: true,
                name: true
              }
            },
            inventoryAllocations: {
              select: {
                allocation_id: true,
                inventory_quantity: true,
                package_quantity: true,
                weight_kg: true,
                volume_m3: true,
                cell: {
                  select: {
                    id: true,
                    row: true,
                    bay: true,
                    position: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!entryOrder) {
      throw new Error("Entry order not found or not approved");
    }

    // 2. Get available warehouses
    const availableWarehouses = await prisma.warehouse.findMany({
      where: { status: "ACTIVE" },
      select: {
        warehouse_id: true,
        name: true,
        location: true,
        capacity: true,
        max_occupancy: true,
        _count: {
          select: {
            cells: {
              where: { status: "AVAILABLE" }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // 3. For each warehouse, get available cells (with client filtering if applicable)
    const warehousesWithCells = await Promise.all(
      availableWarehouses.map(async (warehouse) => {
        // Get available cells for this warehouse
        const availableCells = await getAvailableCells(warehouse.warehouse_id, entryOrderId);
        
        return {
          ...warehouse,
          available_cells_count: availableCells.length,
          available_cells: availableCells.map(cell => ({
            ...cell,
            cell_reference: `${cell.row}.${String(cell.bay).padStart(2, "0")}.${String(cell.position).padStart(2, "0")}`,
            available_capacity: parseFloat(cell.capacity) - parseFloat(cell.currentUsage),
            capacity_percentage: parseFloat(cell.currentUsage) / parseFloat(cell.capacity) * 100
          }))
        };
      })
    );

    // 4. Calculate product details with remaining quantities
    const productsWithDetails = entryOrder.products.map(product => {
      const allocatedQuantity = product.inventoryAllocations.reduce((sum, alloc) => sum + alloc.inventory_quantity, 0);
      const allocatedPackages = product.inventoryAllocations.reduce((sum, alloc) => sum + alloc.package_quantity, 0);
      const allocatedWeight = product.inventoryAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.weight_kg), 0);

      return {
        ...product,
        supplier_name: product.supplier?.company_name || product.supplier?.name,
        allocated_quantity: allocatedQuantity,
        remaining_quantity: product.inventory_quantity - allocatedQuantity,
        allocated_packages: allocatedPackages,
        remaining_packages: product.package_quantity - allocatedPackages,
        allocated_weight: allocatedWeight,
        remaining_weight: parseFloat(product.weight_kg) - allocatedWeight,
        allocation_percentage: product.inventory_quantity > 0 ? (allocatedQuantity / product.inventory_quantity) * 100 : 0,
        is_fully_allocated: allocatedQuantity >= product.inventory_quantity,
        needs_allocation: allocatedQuantity < product.inventory_quantity
      };
    });

    // 5. Calculate overall allocation summary
    const totalProducts = entryOrder.products.length;
    const totalQuantity = entryOrder.products.reduce((sum, p) => sum + p.inventory_quantity, 0);
    const totalPackages = entryOrder.products.reduce((sum, p) => sum + p.package_quantity, 0);
    const totalWeight = entryOrder.products.reduce((sum, p) => sum + parseFloat(p.weight_kg), 0);

    const totalAllocatedQuantity = productsWithDetails.reduce((sum, p) => sum + p.allocated_quantity, 0);
    const totalAllocatedPackages = productsWithDetails.reduce((sum, p) => sum + p.allocated_packages, 0);
    const totalAllocatedWeight = productsWithDetails.reduce((sum, p) => sum + p.allocated_weight, 0);

    const productsNeedingAllocation = productsWithDetails.filter(p => p.needs_allocation);
    const isFullyAllocated = productsNeedingAllocation.length === 0;

    // 6. Allocation constraints and recommendations
    const constraints = {
      client_specific_cells: entryOrder.creator.role.name === "CLIENT",
      requires_temperature_control: productsWithDetails.some(p => p.temperature_range && p.temperature_range !== "AMBIENTE"),
      multi_warehouse_allowed: true, // ✅ Now allowing multi-warehouse allocation
      total_volume_estimate: productsWithDetails.reduce((sum, p) => sum + parseFloat(p.volume_m3 || 0), 0)
    };

    // 7. Validation summary
    const validation = {
      can_complete_allocation: productsNeedingAllocation.length > 0,
      blocking_issues: [],
      warnings: [],
      recommendations: []
    };

    // Check for blocking issues
    if (warehousesWithCells.every(w => w.available_cells_count === 0)) {
      validation.blocking_issues.push("No available cells found in any warehouse");
    }

    if (constraints.client_specific_cells) {
      const clientCellsAvailable = warehousesWithCells.some(w => 
        w.available_cells.some(c => c.is_client_assigned || c.client_assignment_info)
      );
      if (!clientCellsAvailable) {
        validation.blocking_issues.push("No client-assigned cells available for CLIENT entry order");
      }
    }

    // Add warnings
    if (constraints.total_volume_estimate > 1000) {
      validation.warnings.push("Large volume order - ensure sufficient warehouse capacity");
    }

    if (productsNeedingAllocation.length > 20) {
      validation.warnings.push("Large number of products - consider batch allocation");
    }

    // Add recommendations
    if (constraints.requires_temperature_control) {
      validation.recommendations.push("Prioritize temperature-controlled cells for products requiring special storage");
    }

    validation.recommendations.push("Review cell capacity before allocation to avoid over-utilization");

    return {
      entry_order: {
        entry_order_id: entryOrder.entry_order_id,
        entry_order_no: entryOrder.entry_order_no,
        warehouse: entryOrder.warehouse,
        creator_role: entryOrder.creator.role.name
      },
      products: productsWithDetails,
      warehouses: warehousesWithCells,
      allocation_summary: {
        total_products: totalProducts,
        products_needing_allocation: productsNeedingAllocation.length,
        products_fully_allocated: totalProducts - productsNeedingAllocation.length,
        overall_allocation_percentage: totalQuantity > 0 ? (totalAllocatedQuantity / totalQuantity) * 100 : 0,
        is_fully_allocated: isFullyAllocated,
        totals: {
          quantity: { total: totalQuantity, allocated: totalAllocatedQuantity, remaining: totalQuantity - totalAllocatedQuantity },
          packages: { total: totalPackages, allocated: totalAllocatedPackages, remaining: totalPackages - totalAllocatedPackages },
          weight: { total: totalWeight, allocated: totalAllocatedWeight, remaining: totalWeight - totalAllocatedWeight }
        }
      },
      constraints,
      validation,
      can_proceed: validation.blocking_issues.length === 0 && productsNeedingAllocation.length > 0
    };
  } catch (error) {
    console.error("Error in getEntryOrderAllocationHelper:", error);
    throw new Error(`Failed to get allocation helper data: ${error.message}`);
  }
}

// ✅ OPTIMIZED: Bulk assign all products in an entry order in one operation
async function bulkAssignEntryOrder(bulkAssignmentData) {
  const startTime = Date.now();
  console.log(`⏱️ BULK ASSIGNMENT: Starting bulk assignment at ${new Date().toISOString()}`);
  
  const {
    entry_order_id,
    allocations,
    assigned_by,
    force_complete_allocation = false,
    notes
  } = bulkAssignmentData;

  // Validate required data
  if (!entry_order_id || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
    throw new Error("Entry order ID and allocations array are required");
  }

  if (!assigned_by) {
    throw new Error("Assigned by user ID is required");
  }

  console.log(`🚀 OPTIMIZATION: Processing ${allocations.length} allocations in bulk operation`);

  return await prisma.$transaction(async (tx) => {
    // 1. Validate entry order exists and is approved
    const entryOrder = await tx.entryOrder.findUnique({
      where: { 
        entry_order_id,
        review_status: "APPROVED" 
      },
      include: {
        products: true
      }
    });

    if (!entryOrder) {
      throw new Error("Entry order not found or not approved");
    }

    // 2. Validate all products exist and belong to this entry order
    const entryOrderProductIds = entryOrder.products.map(p => p.entry_order_product_id);
    const allocationProductIds = allocations.map(a => a.entry_order_product_id);
    
    const missingProducts = allocationProductIds.filter(id => !entryOrderProductIds.includes(id));
    if (missingProducts.length > 0) {
      throw new Error(`Invalid product IDs: ${missingProducts.join(', ')}`);
    }

    // 3. Validate each allocation individually
    for (let i = 0; i < allocations.length; i++) {
      const allocation = allocations[i];
      
      // Required fields validation
      const requiredFields = ['entry_order_product_id', 'cell_id', 'inventory_quantity', 'package_quantity', 'weight_kg', 'warehouse_id'];
      const missingFields = requiredFields.filter(field => !allocation[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Allocation ${i + 1}: Missing required fields: ${missingFields.join(', ')}`);
      }

      // Validate positive quantities
      if (allocation.inventory_quantity <= 0 || allocation.package_quantity <= 0 || allocation.weight_kg <= 0) {
        throw new Error(`Allocation ${i + 1}: Quantities must be positive numbers`);
      }
    }

    // 4. Validate cells exist and are available
    const cellIds = [...new Set(allocations.map(a => a.cell_id))];
    const cells = await tx.warehouseCell.findMany({
      where: { 
        id: { in: cellIds },
        status: "AVAILABLE" 
      }
    });

    if (cells.length !== cellIds.length) {
      const foundCellIds = cells.map(c => c.id);
      const missingCells = cellIds.filter(id => !foundCellIds.includes(id));
      throw new Error(`Cells not available: ${missingCells.join(', ')}`);
    }

    // 5. Validate quantities don't exceed product limits
    const productQuantityCheck = {};
    for (const allocation of allocations) {
      const productId = allocation.entry_order_product_id;
      if (!productQuantityCheck[productId]) {
        productQuantityCheck[productId] = { quantity: 0, packages: 0, weight: 0 };
      }
      productQuantityCheck[productId].quantity += parseInt(allocation.inventory_quantity);
      productQuantityCheck[productId].packages += parseInt(allocation.package_quantity);
      productQuantityCheck[productId].weight += parseFloat(allocation.weight_kg);
    }

    // ✅ OPTIMIZED: Batch query existing allocations for all products
    const existingAllocations = await tx.inventoryAllocation.findMany({
      where: { 
        entry_order_product_id: { in: entryOrderProductIds }
      }
    });

    // Group existing allocations by product
    const existingAllocationsByProduct = existingAllocations.reduce((acc, allocation) => {
      if (!acc[allocation.entry_order_product_id]) {
        acc[allocation.entry_order_product_id] = [];
      }
      acc[allocation.entry_order_product_id].push(allocation);
      return acc;
    }, {});

    // Check against existing allocations + new allocations
    for (const product of entryOrder.products) {
      const existingProductAllocations = existingAllocationsByProduct[product.entry_order_product_id] || [];
      
      const existingQuantity = existingProductAllocations.reduce((sum, a) => sum + a.inventory_quantity, 0);
      const existingPackages = existingProductAllocations.reduce((sum, a) => sum + a.package_quantity, 0);
      const existingWeight = existingProductAllocations.reduce((sum, a) => sum + parseFloat(a.weight_kg), 0);

      const newQuantity = productQuantityCheck[product.entry_order_product_id]?.quantity || 0;
      const newPackages = productQuantityCheck[product.entry_order_product_id]?.packages || 0;
      const newWeight = productQuantityCheck[product.entry_order_product_id]?.weight || 0;

      if (existingQuantity + newQuantity > product.inventory_quantity) {
        throw new Error(`Product ${product.product_code}: Total allocation (${existingQuantity + newQuantity}) exceeds available quantity (${product.inventory_quantity})`);
      }

      if (existingPackages + newPackages > product.package_quantity) {
        throw new Error(`Product ${product.product_code}: Total package allocation (${existingPackages + newPackages}) exceeds available packages (${product.package_quantity})`);
      }
    }

    // ✅ OPTIMIZED: Batch get product IDs to avoid N+1 queries
    const productIdMap = new Map();
    for (const product of entryOrder.products) {
      productIdMap.set(product.entry_order_product_id, product.product_id);
    }

    // ✅ OPTIMIZED: Prepare all allocation data for batch creation
    const allocationDataToCreate = allocations.map(allocationData => {
      const productStatusEnum = allocationData.product_status || 'PAL_NORMAL';
      const statusCode = allocationData.status_code || 30;
      
      return {
        entry_order_id,
        entry_order_product_id: allocationData.entry_order_product_id,
        inventory_quantity: parseInt(allocationData.inventory_quantity),
        package_quantity: parseInt(allocationData.package_quantity),
        quantity_pallets: parseInt(allocationData.quantity_pallets) || Math.ceil(parseInt(allocationData.package_quantity) / 20),
        presentation: allocationData.presentation || 'PALETA',
        weight_kg: parseFloat(allocationData.weight_kg),
        volume_m3: parseFloat(allocationData.volume_m3) || null,
        cell_id: allocationData.cell_id,
        product_status: productStatusEnum,
        status_code: statusCode,
        quality_status: "CUARENTENA",
        allocated_by: assigned_by,
        guide_number: allocationData.guide_number || null,
        uploaded_documents: allocationData.uploaded_documents || null,
        observations: allocationData.observations || notes || null,
        status: "ACTIVE"
      };
    });

    // ✅ OPTIMIZED: Batch create all allocations
    const createdAllocations = await tx.inventoryAllocation.createMany({
      data: allocationDataToCreate
    });

    // ✅ OPTIMIZED: Get the created allocation IDs for inventory creation
    const createdAllocationRecords = await tx.inventoryAllocation.findMany({
      where: {
        entry_order_id,
        allocated_by: assigned_by,
        allocated_at: {
          gte: new Date(Date.now() - 1000) // Get allocations created in the last second
        }
      },
      orderBy: { allocated_at: 'desc' },
      take: allocations.length
    });

    // ✅ OPTIMIZED: Prepare inventory data for batch creation
    const inventoryDataToCreate = createdAllocationRecords.map((allocation, index) => {
      const allocationData = allocations[index];
      const productStatusEnum = allocationData.product_status || 'PAL_NORMAL';
      const statusCode = allocationData.status_code || 30;
      
      return {
        allocation_id: allocation.allocation_id,
        product_id: productIdMap.get(allocationData.entry_order_product_id),
        cell_id: allocationData.cell_id,
        warehouse_id: allocationData.warehouse_id,
        current_quantity: parseInt(allocationData.inventory_quantity),
        current_package_quantity: parseInt(allocationData.package_quantity),
        current_weight: parseFloat(allocationData.weight_kg),
        current_volume: parseFloat(allocationData.volume_m3) || null,
        status: "QUARANTINED",
        product_status: productStatusEnum,
        status_code: statusCode,
        quality_status: "CUARENTENA",
        created_by: assigned_by
      };
    });

    // ✅ OPTIMIZED: Batch create all inventory records
    const createdInventoryRecords = await tx.inventory.createMany({
      data: inventoryDataToCreate
    });

    // ✅ OPTIMIZED: Prepare inventory log data for batch creation
    const inventoryLogDataToCreate = createdAllocationRecords.map((allocation, index) => {
      const allocationData = allocations[index];
      const productStatusEnum = allocationData.product_status || 'PAL_NORMAL';
      const statusCode = allocationData.status_code || 30;
      
      return {
        user_id: assigned_by,
        product_id: productIdMap.get(allocationData.entry_order_product_id),
        movement_type: "ENTRY",
        quantity_change: parseInt(allocationData.inventory_quantity),
        package_change: parseInt(allocationData.package_quantity),
        weight_change: parseFloat(allocationData.weight_kg),
        volume_change: parseFloat(allocationData.volume_m3) || null,
        entry_order_id,
        entry_order_product_id: allocationData.entry_order_product_id,
        allocation_id: allocation.allocation_id,
        warehouse_id: allocationData.warehouse_id,
        cell_id: allocationData.cell_id,
        product_status: productStatusEnum,
        status_code: statusCode,
        notes: `Bulk assignment: ${allocationData.inventory_quantity} units to quarantine`
      };
    });

    // ✅ OPTIMIZED: Batch create all inventory logs
    await tx.inventoryLog.createMany({
      data: inventoryLogDataToCreate
    });

    // ✅ OPTIMIZED: Calculate cell updates in memory
    const cellsToUpdate = new Map();
    for (const allocationData of allocations) {
      const cellId = allocationData.cell_id;
      if (!cellsToUpdate.has(cellId)) {
        cellsToUpdate.set(cellId, { packages: 0, weight: 0, volume: 0 });
      }
      const cellUpdate = cellsToUpdate.get(cellId);
      cellUpdate.packages += parseInt(allocationData.package_quantity);
      cellUpdate.weight += parseFloat(allocationData.weight_kg);
      cellUpdate.volume += parseFloat(allocationData.volume_m3) || 0;
    }

    // ✅ OPTIMIZED: Batch update all affected cells
    const cellUpdates = [];
    const cellUpdatePromises = [];
    
    for (const [cellId, updates] of cellsToUpdate.entries()) {
      const updatePromise = tx.warehouseCell.update({
        where: { id: cellId },
        data: {
          status: "OCCUPIED",
          current_packaging_qty: { increment: updates.packages },
          current_weight: { increment: updates.weight },
          currentUsage: updates.volume > 0 ? { increment: updates.volume } : undefined
        }
      });
      cellUpdatePromises.push(updatePromise);
      cellUpdates.push({ cellId, ...updates });
    }
    
    // Execute all cell updates in parallel
    await Promise.all(cellUpdatePromises);

    // 8. Calculate final allocation status
    const updatedProducts = await tx.entryOrderProduct.findMany({
      where: { entry_order_id },
      include: {
        inventoryAllocations: true,
        product: { select: { product_code: true, name: true } }
      }
    });

    let totalQuantity = 0;
    let totalAllocated = 0;
    const allocationSummary = {
      total_quantity_allocated: 0,
      total_packages_allocated: 0,
      total_weight_allocated: 0,
      products_fully_allocated: 0,
      products_partially_allocated: 0,
      products_not_allocated: 0
    };

    updatedProducts.forEach(product => {
      const allocated = product.inventoryAllocations.reduce((sum, a) => sum + a.inventory_quantity, 0);
      totalQuantity += product.inventory_quantity;
      totalAllocated += allocated;

      if (allocated >= product.inventory_quantity) {
        allocationSummary.products_fully_allocated++;
      } else if (allocated > 0) {
        allocationSummary.products_partially_allocated++;
      } else {
        allocationSummary.products_not_allocated++;
      }

      allocationSummary.total_quantity_allocated += allocated;
      allocationSummary.total_packages_allocated += product.inventoryAllocations.reduce((sum, a) => sum + a.package_quantity, 0);
      allocationSummary.total_weight_allocated += product.inventoryAllocations.reduce((sum, a) => sum + parseFloat(a.weight_kg), 0);
    });

    const isFullyAllocated = totalAllocated >= totalQuantity;
    const allocationPercentage = totalQuantity > 0 ? (totalAllocated / totalQuantity) * 100 : 0;

    // 9. Create audit log
    await createAuditLog(
      assigned_by,
      "INVENTORY_ALLOCATED",
      "EntryOrder",
      entry_order_id,
      `Bulk allocated ${createdAllocations.length} product allocations for entry order ${entryOrder.entry_order_no}`,
      null,
      {
        allocations_created: createdAllocations.length,
        products_affected: Object.keys(productQuantityCheck).length,
        cells_used: cellsToUpdate.size,
        is_fully_allocated: isFullyAllocated,
        allocation_percentage: allocationPercentage
      },
      {
        entry_order_no: entryOrder.entry_order_no,
        bulk_operation: true,
        warehouses_used: [...new Set(allocations.map(a => a.warehouse_id))]
      }
    );

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`✅ OPTIMIZATION COMPLETE: Bulk assignment processed ${allocations.length} allocations in ${duration}ms`);
    console.log(`🚀 PERFORMANCE: Reduced from ~${allocations.length * 3} individual queries to ~5 batch queries`);
    
    return {
      entry_order_id,
      entry_order_no: entryOrder.entry_order_no,
      allocations: createdAllocationRecords,
      inventory_records: createdInventoryRecords,
      cells_occupied: cellUpdates,
      is_fully_allocated: isFullyAllocated,
      allocation_percentage: allocationPercentage,
      summary: allocationSummary,
      warehouses_used: [...new Set(allocations.map(a => a.warehouse_id))],
      message: isFullyAllocated 
        ? "Entry order fully allocated to quarantine" 
        : `Entry order partially allocated (${allocationPercentage.toFixed(1)}%)`,
      performance: {
        duration_ms: duration,
        allocations_processed: allocations.length,
        queries_reduced: `${allocations.length * 3} → ~5`
      }
    };
  }, {
    timeout: 30000 // ✅ INCREASED: Extended timeout to 30 seconds for bulk operations
  });
}

// ✅ NEW: Get entry order creator information for role-based filtering
async function getEntryOrderCreatorInfo(entryOrderId) {
  try {
    const entryOrder = await prisma.entryOrder.findUnique({
      where: { entry_order_id: entryOrderId },
      select: {
        entry_order_id: true,
        entry_order_no: true,
        created_by: true,
        creator: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!entryOrder) {
      throw new Error(`Entry order with ID ${entryOrderId} not found`);
    }

    return {
      entry_order_id: entryOrder.entry_order_id,
      entry_order_no: entryOrder.entry_order_no,
      creator_id: entryOrder.creator.id,
      creator_name: `${entryOrder.creator.first_name || ""} ${entryOrder.creator.last_name || ""}`.trim(),
      creator_email: entryOrder.creator.email,
      creator_role: entryOrder.creator.role.name
    };
  } catch (error) {
    console.error("Error in getEntryOrderCreatorInfo:", error);
    throw new Error(`Failed to get entry order creator info: ${error.message}`);
  }
}

// ✅ NEW: Get cells filtered by quality status for client-assigned cells only
async function getCellsByQualityStatusForClient(qualityStatus, warehouseId = null, clientUserId = null) {
  // Map quality status to appropriate cell roles
  const statusToCellRoleMap = {
    CUARENTENA: ["STANDARD"], // Quarantine can use standard cells
    APROBADO: ["STANDARD"], // Approved can use standard cells
    DEVOLUCIONES: ["RETURNS"], // Returns need RETURNS role cells
    CONTRAMUESTRAS: ["SAMPLES"], // Samples need SAMPLES role cells
    RECHAZADOS: ["REJECTED", "DAMAGED"], // Rejected can use REJECTED or DAMAGED cells
  };

  const allowedRoles = statusToCellRoleMap[qualityStatus] || ["STANDARD"];
  
  // Find the client record for the user using ClientUser relationship
  const clientUser = await prisma.user.findUnique({
    where: { id: clientUserId },
    include: {
      role: true
    }
  });

  if (!clientUser || clientUser.role.name !== "CLIENT") {
    throw new Error(`User is not a client. Role found: ${clientUser?.role?.name || 'undefined'}`);
  }

  // ✅ FIXED: Use ClientUser relationship to find the correct client
  const clientUserRecord = await prisma.clientUser.findFirst({
    where: { 
      user_id: clientUserId,
      is_active: true
    },
    select: { 
      client_id: true,
      client: {
        select: {
          client_id: true,
          company_name: true,
          first_names: true,
          last_name: true
        }
      }
    }
  });

  if (!clientUserRecord) {
    throw new Error(`No client record found for user ${clientUserId}. User may not be properly associated with a client.`);
  }

  const client = { client_id: clientUserRecord.client_id };
  console.log(`📝 Found client for user ${clientUserId}: ${clientUserRecord.client.company_name || `${clientUserRecord.client.first_names} ${clientUserRecord.client.last_name}`}`);
  

  // Build where clause for client-assigned cells with quality status filtering
  const where = {
    status: "AVAILABLE",
    cell_role: { in: allowedRoles },
    clientCellAssignments: {
      some: {
        client_id: client.client_id,
        is_active: true
      }
    }
  };

  if (warehouseId) {
    where.warehouse_id = warehouseId;
  }

  const cells = await prisma.warehouseCell.findMany({
    where,
    select: {
      id: true,
      row: true,
      bay: true,
      position: true,
      capacity: true,
      currentUsage: true,
      current_packaging_qty: true,
      current_weight: true,
      status: true,
      kind: true,
      cell_role: true,
      warehouse: {
        select: {
          warehouse_id: true,
          name: true,
        }
      },
      // Include assignment details for context
      clientCellAssignments: {
        where: {
          client_id: client.client_id,
          is_active: true
        },
        select: {
          priority: true,
          max_capacity: true,
          notes: true
        }
      }
    },
    orderBy: [
      { clientCellAssignments: { _count: "desc" } }, // Prioritize assigned cells
      { row: "asc" }, 
      { bay: "asc" }, 
      { position: "asc" }
    ],
  });

  return cells.map(cell => ({
    ...cell,
    cell_reference: `${cell.row}.${String(cell.bay).padStart(2, "0")}.${String(cell.position).padStart(2, "0")}`,
    role_description: {
      STANDARD: "Standard Storage",
      RETURNS: "Returns Area",
      SAMPLES: "Sample Storage", 
      REJECTED: "Rejected Items",
      DAMAGED: "Damaged Items",
      EXPIRED: "Expired Items"
    }[cell.cell_role],
    is_client_assigned: true,
    client_assignment_info: cell.clientCellAssignments[0] || null,
    // Remove nested data for cleaner response
    clientCellAssignments: undefined
  }));
}

module.exports = {
  getApprovedEntryOrdersForInventory,
  getEntryOrderProductsForInventory,
  assignProductToCell,
  getAvailableCells,
  getClientAssignedCells,
  getInventorySummary,
  getAllWarehouses,
  getWarehouseCells,
  createAuditLog,
  getQuarantineInventory,
  getInventoryByQualityStatus,
  transitionQualityStatus,
  getAvailableInventoryForDeparture,
  getInventoryAuditTrail,
  validateInventorySynchronization,
  getCellsByQualityStatus,
  getEntryOrderWarehouse,
  // ✅ NEW: Simplified allocation flow
  getEntryOrderAllocationHelper,
  bulkAssignEntryOrder,
  getEntryOrderCreatorInfo,
  getCellsByQualityStatusForClient,
};