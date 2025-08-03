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

/**
 * ✅ NEW: Change cell quality purpose/role (ADMIN only)
 * @param {string} cellId - Cell ID to update
 * @param {string} newCellRole - New cell role (STANDARD, REJECTED, SAMPLES, RETURNS, DAMAGED, EXPIRED)
 * @param {string} userRole - User role for permission check
 * @param {string} userId - User ID for audit trail
 * @param {string} changeReason - Reason for the change
 * @returns {Promise<Object>} - Updated cell with change log
 */
async function changeCellQualityPurpose(cellId, newCellRole, userRole, userId, changeReason = null) {
  try {
    // ✅ Permission check - only ADMIN can change cell roles
    if (userRole !== 'ADMIN') {
      throw new Error('Only ADMIN users can change cell quality purposes');
    }

    // Validate the new cell role
    const validRoles = ['STANDARD', 'REJECTED', 'SAMPLES', 'RETURNS', 'DAMAGED', 'EXPIRED'];
    if (!validRoles.includes(newCellRole)) {
      throw new Error(`Invalid cell role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Get current cell information
    const currentCell = await prisma.warehouseCell.findUnique({
      where: { id: cellId },
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
                company_name: true,
                first_names: true,
                last_name: true,
                client_type: true
              }
            }
          }
        },
        inventory: {
          where: { 
            status: { in: ['AVAILABLE', 'QUARANTINED', 'RESERVED'] }
          },
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
          }
        }
      }
    });

    if (!currentCell) {
      throw new Error('Cell not found');
    }

    // Check if cell role is actually changing
    if (currentCell.cell_role === newCellRole) {
      return {
        success: true,
        message: `Cell is already set to ${newCellRole}`,
        data: currentCell,
        changed: false
      };
    }

    // Validate cell state for role change
    const hasActiveInventory = currentCell.inventory && currentCell.inventory.length > 0;
    const hasClientAssignments = currentCell.clientCellAssignments && currentCell.clientCellAssignments.length > 0;

    // Warning checks (not blocking, but informative)
    const warnings = [];
    
    if (hasActiveInventory) {
      warnings.push(`Cell contains ${currentCell.inventory.length} active inventory items`);
    }

    if (hasClientAssignments) {
      const clientNames = currentCell.clientCellAssignments.map(assignment => 
        assignment.client.client_type === 'JURIDICO' 
          ? assignment.client.company_name 
          : `${assignment.client.first_names} ${assignment.client.last_name}`
      );
      warnings.push(`Cell is assigned to client(s): ${clientNames.join(', ')}`);
    }

    // Perform the cell role update
    const updatedCell = await prisma.$transaction(async (tx) => {
      // Update the cell role
      const cell = await tx.warehouseCell.update({
        where: { id: cellId },
        data: {
          cell_role: newCellRole
        },
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
                  company_name: true,
                  first_names: true,
                  last_name: true,
                  client_type: true
                }
              }
            }
          }
        }
      });

      // Create audit log entry for the change
      await tx.systemAuditLog.create({
        data: {
          user_id: userId,
          action: 'CELL_ROLE_CHANGE',
          entity_type: 'WarehouseCell',
          entity_id: cellId,
          description: `Changed cell quality purpose from ${currentCell.cell_role} to ${newCellRole}`,
          old_values: {
            cell_role: currentCell.cell_role,
            cell_reference: `${currentCell.row}.${String(currentCell.bay).padStart(2, '0')}.${String(currentCell.position).padStart(2, '0')}`,
            warehouse: currentCell.warehouse.name
          },
          new_values: {
            cell_role: newCellRole,
            change_reason: changeReason || 'No reason provided',
            cell_reference: `${currentCell.row}.${String(currentCell.bay).padStart(2, '0')}.${String(currentCell.position).padStart(2, '0')}`,
            warehouse: currentCell.warehouse.name
          },
          metadata: {
            operation_type: 'CELL_MANAGEMENT',
            had_active_inventory: hasActiveInventory,
            had_client_assignments: hasClientAssignments,
            inventory_count: currentCell.inventory?.length || 0,
            client_assignment_count: currentCell.clientCellAssignments?.length || 0,
            warnings: warnings
          }
        }
      });

      return cell;
    });

    // Map role to human-readable purpose
    const purposeMapping = {
      STANDARD: "Regular storage",
      REJECTED: "RECHAZADOS - Rejected products",
      SAMPLES: "CONTRAMUESTRAS - Product samples",
      RETURNS: "DEVOLUCIONES - Product returns",
      DAMAGED: "Damaged products",
      EXPIRED: "Expired products"
    };

    return {
      success: true,
      message: `Cell quality purpose changed from ${purposeMapping[currentCell.cell_role]} to ${purposeMapping[newCellRole]}`,
      data: {
        ...updatedCell,
        quality_purpose: purposeMapping[newCellRole],
        cell_reference: `${updatedCell.row}.${String(updatedCell.bay).padStart(2, '0')}.${String(updatedCell.position).padStart(2, '0')}`,
        change_log: {
          changed_from: currentCell.cell_role,
          changed_to: newCellRole,
          changed_by: userId,
          changed_at: new Date(),
          change_reason: changeReason || 'No reason provided',
          warnings: warnings
        }
      },
      changed: true,
      warnings: warnings
    };

  } catch (error) {
    console.error("Error in changeCellQualityPurpose service:", error);
    throw new Error(`Error changing cell quality purpose: ${error.message}`);
  }
}

/**
 * ✅ NEW: Get cell role change history
 * @param {string} cellId - Cell ID
 * @returns {Promise<Array>} - Array of role changes
 */
async function getCellRoleChangeHistory(cellId) {
  try {
    const history = await prisma.systemAuditLog.findMany({
      where: {
        entity_type: 'WarehouseCell',
        entity_id: cellId,
        action: 'CELL_ROLE_CHANGE'
      },
      include: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            role: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: {
        performed_at: 'desc'
      }
    });

    return history.map(log => ({
      change_id: log.audit_id,
      changed_from: log.old_values?.cell_role,
      changed_to: log.new_values?.cell_role,
      change_reason: log.new_values?.change_reason,
      changed_by: {
        user_id: log.user.id,
        name: `${log.user.first_name} ${log.user.last_name}`,
        email: log.user.email,
        role: log.user.role?.name
      },
      changed_at: log.performed_at,
      description: log.description,
      warnings: log.metadata?.warnings || [],
      had_inventory: log.metadata?.had_active_inventory || false,
      had_assignments: log.metadata?.had_client_assignments || false
    }));

  } catch (error) {
    console.error("Error in getCellRoleChangeHistory service:", error);
    throw new Error(`Error fetching cell role change history: ${error.message}`);
  }
}

/**
 * ✅ NEW: Get cells by role for quality control management
 * @param {string} warehouseId - Optional warehouse filter
 * @param {string} cellRole - Optional cell role filter
 * @returns {Promise<Object>} - Grouped cells by role
 */
async function getCellsByRole(warehouseId = null, cellRole = null) {
  try {
    const whereCondition = {
      is_passage: false // Exclude passage cells
    };

    if (warehouseId) {
      whereCondition.warehouse_id = warehouseId;
    }

    if (cellRole) {
      whereCondition.cell_role = cellRole;
    }

    const cells = await prisma.warehouseCell.findMany({
      where: whereCondition,
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
                company_name: true,
                first_names: true,
                last_name: true,
                client_type: true
              }
            }
          }
        },
        _count: {
          select: {
            inventory: {
              where: { 
                status: { in: ['AVAILABLE', 'QUARANTINED', 'RESERVED'] }
              }
            }
          }
        }
      },
      orderBy: [
        { warehouse_id: 'asc' },
        { cell_role: 'asc' },
        { row: 'asc' },
        { bay: 'asc' },
        { position: 'asc' }
      ]
    });

    // Group by cell role
    const cellsByRole = {
      STANDARD: [],
      REJECTED: [],
      SAMPLES: [],
      RETURNS: [],
      DAMAGED: [],
      EXPIRED: []
    };

    const cellsByWarehouse = {};

    cells.forEach(cell => {
      const cellData = {
        ...cell,
        cell_reference: `${cell.row}.${String(cell.bay).padStart(2, '0')}.${String(cell.position).padStart(2, '0')}`,
        quality_purpose: {
          STANDARD: "Regular storage",
          REJECTED: "RECHAZADOS - Rejected products", 
          SAMPLES: "CONTRAMUESTRAS - Product samples",
          RETURNS: "DEVOLUCIONES - Product returns",
          DAMAGED: "Damaged products",
          EXPIRED: "Expired products"
        }[cell.cell_role],
        has_inventory: cell._count.inventory > 0,
        has_client_assignment: cell.clientCellAssignments.length > 0,
        client_info: cell.clientCellAssignments.length > 0 ? {
          client_id: cell.clientCellAssignments[0].client.client_id,
          client_name: cell.clientCellAssignments[0].client.client_type === 'JURIDICO'
            ? cell.clientCellAssignments[0].client.company_name
            : `${cell.clientCellAssignments[0].client.first_names} ${cell.clientCellAssignments[0].client.last_name}`,
          client_type: cell.clientCellAssignments[0].client.client_type
        } : null
      };

      cellsByRole[cell.cell_role].push(cellData);

      // Group by warehouse
      if (!cellsByWarehouse[cell.warehouse_id]) {
        cellsByWarehouse[cell.warehouse_id] = {
          warehouse: cell.warehouse,
          cells_by_role: {
            STANDARD: [],
            REJECTED: [],
            SAMPLES: [],
            RETURNS: [],
            DAMAGED: [],
            EXPIRED: []
          },
          total_cells: 0
        };
      }

      cellsByWarehouse[cell.warehouse_id].cells_by_role[cell.cell_role].push(cellData);
      cellsByWarehouse[cell.warehouse_id].total_cells++;
    });

    return {
      total_cells: cells.length,
      cells_by_role: cellsByRole,
      cells_by_warehouse: cellsByWarehouse,
      summary: {
        standard_cells: cellsByRole.STANDARD.length,
        rejected_cells: cellsByRole.REJECTED.length,
        samples_cells: cellsByRole.SAMPLES.length,
        returns_cells: cellsByRole.RETURNS.length,
        damaged_cells: cellsByRole.DAMAGED.length,
        expired_cells: cellsByRole.EXPIRED.length,
        total_special_cells: cellsByRole.REJECTED.length + cellsByRole.SAMPLES.length + 
                            cellsByRole.RETURNS.length + cellsByRole.DAMAGED.length + cellsByRole.EXPIRED.length
      }
    };

  } catch (error) {
    console.error("Error in getCellsByRole service:", error);
    throw new Error(`Error fetching cells by role: ${error.message}`);
  }
}

module.exports = { 
  assignPallets, 
  getAllWarehouseCells, 
  fetchWarehouses,
  changeCellQualityPurpose,
  getCellRoleChangeHistory,
  getCellsByRole
};
