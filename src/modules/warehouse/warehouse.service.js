const {
  PrismaClient,
  CellStatus,
  MovementType,
  InventoryStatus,
} = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Assign N pallets in a given row of a warehouse,
 * filling A.01.01 → A.01.10, then A.02.01 → etc.
 */
async function assignPallets(
  warehouse_id,
  row,
  palletCount,
  product_id,
  user_id
) {
  return await prisma.$transaction(async (tx) => {
    const wh = await tx.warehouse.findUnique({ where: { warehouse_id } });
    if (!wh) throw new Error("Warehouse not found");
    if (!row) throw new Error("Row code is required");
    if (palletCount < 1) throw new Error("palletCount must be ≥ 1");

    const freeSlots = await tx.warehouseCell.findMany({
      where: { warehouse_id, row, kind: "NORMAL", status: "AVAILABLE", is_passage: false },
      orderBy: [{ bay: "asc" }, { position: "asc" }],
    });
    if (freeSlots.length < palletCount) {
      throw new Error(
        `Not enough free slots in row ${row}: requested ${palletCount}, found ${freeSlots.length}`
      );
    }

    const assigned = [];
    for (let i = 0; i < palletCount; i++) {
      const slot = freeSlots[i];
      await tx.inventory.create({
        data: {
          product_id,
          warehouse_id,
          cell_id: slot.id,
          quantity: 1,
          status: InventoryStatus.AVAILABLE,
        },
      });
      await tx.inventoryLog.create({
        data: {
          user_id,
          product_id,
          quantity_change: 1,
          movement_type: MovementType.ENTRY,
          warehouse_id,
          cell_id: slot.id,
          notes: `Stored 1 pallet in ${row}.${String(slot.bay).padStart(
            2,
            "0"
          )}.${String(slot.position).padStart(2, "0")}`,
        },
      });
      await tx.warehouseCell.update({
        where: { id: slot.id },
        data: { currentUsage: { increment: 1 }, status: CellStatus.OCCUPIED },
      });
      assigned.push(slot);
    }
    return assigned;
  });
}

/**
 * Fetch all cells with client assignment status, optionally filtering by warehouse and user role
 */
async function getAllWarehouseCells(filter = {}, userContext = {}) {
  const { userId, userRole } = userContext;
  
  // ✅ NEW: Determine if user should see only their assigned cells
  const isClientUser = userRole && !['ADMIN', 'WAREHOUSE_INCHARGE'].includes(userRole);
  
  const where = {};
  if (filter.warehouse_id) where.warehouse_id = filter.warehouse_id;
  
  // ✅ NEW: If client user, find their client assignments first
  let userClientIds = [];
  if (isClientUser && userId) {
    try {
      // Check if user is a client user (has clientUserAccounts)
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
        userClientIds = userWithClients.clientUserAccounts.map(acc => acc.client_id);
        
        // ✅ Filter to only show cells assigned to user's clients
        where.clientCellAssignments = {
          some: {
            is_active: true,
            client_id: { in: userClientIds }
          }
        };
      } else {
        // If no client assignments found, return empty array
        return [];
      }
    } catch (error) {
      console.error("Error fetching user client assignments:", error);
      return [];
    }
  }
  
  const cells = await prisma.warehouseCell.findMany({
    where,
    include: {
      warehouse: {
        select: {
          warehouse_id: true,
          name: true,
          location: true
        }
      },
      clientCellAssignments: {
        where: { is_active: true },
        include: {
          client: {
            select: {
              client_id: true,
              client_type: true,
              company_name: true,
              first_names: true,
              last_name: true,
              email: true
            }
          },
          assignedBy: {
            select: {
              first_name: true,
              last_name: true,
              email: true
            }
          }
        }
      },
      inventory: {
        select: {
          inventory_id: true,
          current_quantity: true,
          status: true,
          product: {
            select: {
              product_code: true,
              name: true
            }
          }
        },
        take: 5 // Limit to show recent inventory
      },
      _count: {
        select: {
          inventory: true,
          clientCellAssignments: {
            where: { is_active: true }
          }
        }
      }
    },
    orderBy: [
      { warehouse_id: "asc" },
      { row: "asc" },
      { bay: "asc" },
      { position: "asc" },
    ],
  });

  // Transform data to include client assignment status
  return cells.map(cell => {
    const activeAssignment = cell.clientCellAssignments[0] || null;
    const clientInfo = activeAssignment ? {
      client_id: activeAssignment.client.client_id,
      client_name: activeAssignment.client.client_type === "JURIDICO" 
        ? activeAssignment.client.company_name 
        : `${activeAssignment.client.first_names} ${activeAssignment.client.last_name}`,
      client_type: activeAssignment.client.client_type,
      client_email: activeAssignment.client.email,
      assigned_by: `${activeAssignment.assignedBy.first_name} ${activeAssignment.assignedBy.last_name}`,
      assigned_at: activeAssignment.assigned_at,
      priority: activeAssignment.priority,
      notes: activeAssignment.notes
    } : null;

    return {
      ...cell,
      cell_location: `${cell.row}.${cell.bay}.${cell.position}`,
      is_assigned_to_client: !!activeAssignment,
      client_assignment: clientInfo,
      has_inventory: cell._count.inventory > 0,
      inventory_count: cell._count.inventory,
      assignment_count: cell._count.clientCellAssignments,
      // ✅ NEW: Add quality control purpose for special cells
      quality_purpose: {
        STANDARD: "Regular storage",
        REJECTED: "RECHAZADOS - Rejected products",
        SAMPLES: "CONTRAMUESTRAS - Product samples",
        RETURNS: "DEVOLUCIONES - Product returns",
        DAMAGED: "Damaged products",
        EXPIRED: "Expired products"
      }[cell.cell_role] || "Regular storage",
      // ✅ NEW: Add passage cell indicator for frontend filtering
      is_passage: cell.is_passage || false,
      display_type: cell.is_passage ? "PASSAGE" : "CELL"
    };
  });
}

/**
 * Fetch all warehouses for dropdown with detailed information, filtered by user role
 */
async function fetchWarehouses(userContext = {}) {
  const { userId, userRole } = userContext;
  
  // ✅ NEW: Determine if user should see only warehouses with their assigned cells
  const isClientUser = userRole && !['ADMIN', 'WAREHOUSE_INCHARGE'].includes(userRole);
  
  if (isClientUser && userId) {
    try {
      // ✅ Get warehouses that contain cells assigned to user's clients
      const userWithClients = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          clientUserAccounts: {
            where: { is_active: true },
            select: { 
              client: {
                select: {
                  cellAssignments: {
                    where: { is_active: true },
                    select: {
                      warehouse_id: true,
                      warehouse: {
                        select: {
                          warehouse_id: true,
                          name: true,
                          location: true,
                          capacity: true,
                          max_occupancy: true,
                          status: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      
      if (!userWithClients?.clientUserAccounts?.length) {
        return []; // No client assignments found
      }
      
      // Extract unique warehouse IDs from client assignments
      const warehouseIds = new Set();
      const warehouseMap = new Map();
      
      userWithClients.clientUserAccounts.forEach(account => {
        account.client.cellAssignments.forEach(assignment => {
          warehouseIds.add(assignment.warehouse_id);
          warehouseMap.set(assignment.warehouse_id, assignment.warehouse);
        });
      });
      
      if (warehouseIds.size === 0) {
        return []; // No warehouses found
      }
      
      // Get detailed warehouse information with counts
      const warehouses = await prisma.warehouse.findMany({
        where: {
          warehouse_id: { in: Array.from(warehouseIds) }
        },
        select: { 
          warehouse_id: true, 
          name: true,
          location: true,
          capacity: true,
          max_occupancy: true,
          status: true,
          _count: {
            select: {
              cells: {
                where: { is_passage: false } // Exclude passage cells from storage counts
              },
              inventory: true,
              // ✅ Count cells assigned to user's clients (excluding passages)
              clientCellAssignments: {
                where: {
                  is_active: true,
                  cell: { is_passage: false }, // Only count storage cell assignments
                  client: {
                    clientUsers: {
                      some: {
                        user_id: userId,
                        is_active: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { name: "asc" }
      });
      
      return warehouses.map(warehouse => ({
        ...warehouse,
        user_assigned_cells: warehouse._count.clientCellAssignments,
        is_client_filtered: true
      }));
      
    } catch (error) {
      console.error("Error fetching client warehouses:", error);
      return [];
    }
  }
  
  // ✅ For ADMIN and WAREHOUSE_INCHARGE, return all warehouses
  const warehouses = await prisma.warehouse.findMany({
    select: { 
      warehouse_id: true, 
      name: true,
      location: true,
      capacity: true,
      max_occupancy: true,
      status: true,
      _count: {
        select: {
          cells: {
            where: { is_passage: false } // Exclude passage cells from storage counts
          },
          inventory: true,
          clientCellAssignments: {
            where: { 
              is_active: true,
              cell: { is_passage: false } // Only count storage cell assignments
            }
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });
  
  return warehouses.map(warehouse => ({
    ...warehouse,
    total_assigned_cells: warehouse._count.clientCellAssignments,
    is_client_filtered: false
  }));
}

module.exports = { assignPallets, getAllWarehouseCells, fetchWarehouses };
