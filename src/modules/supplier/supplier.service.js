const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Create a new supplier
 * @param {Object} supplierData - The supplier data
 * @returns {Promise<Object>} - The created supplier
 */
async function createSupplier(supplierData, userRole = null, userId = null) {
  try {
    const newSupplier = await prisma.supplier.create({
      data: {
        company_name: supplierData.company_name,
        category: supplierData.category || null,
        tax_id: supplierData.tax_id || null,
        registered_address: supplierData.registered_address || null,
        city: supplierData.city || null,
        contact_no: supplierData.contact_no || null,
        contact_person: supplierData.contact_person || null,
        notes: supplierData.notes || null,
        name: supplierData.name || supplierData.company_name,
        address: supplierData.address || supplierData.registered_address,
        phone: supplierData.phone || supplierData.contact_no,
        email: supplierData.email || null,
        ruc: supplierData.ruc || supplierData.tax_id,
        ...(supplierData.country_id && {
          country: {
            connect: { country_id: supplierData.country_id }
          }
        })
      },
      include: {
        country: true
      }
    });
    
    // ✅ NEW: Auto-assign supplier to client if created by CLIENT role
    if (userRole === "CLIENT" && userId) {
      try {
        // Find the client account for this user using the new ClientUser table
        const clientUser = await prisma.clientUser.findFirst({
          where: { 
            user_id: userId,
            is_active: true
          },
          include: { 
            client: {
              select: { client_id: true }
            }
          }
        });
        
        if (clientUser?.client) {
          // Create client-supplier assignment
          await prisma.clientSupplierAssignment.create({
            data: {
              client_id: clientUser.client.client_id,
              supplier_id: newSupplier.supplier_id,
              assigned_by: userId, // The client user who created it
              preferred_supplier: false, // Not preferred by default
              notes: `Auto-assigned when supplier was created by client user`,
              is_active: true
            }
          });
          
          console.log(`✅ Auto-assigned supplier ${newSupplier.supplier_id} to client ${clientUser.client.client_id}`);
        } else {
          console.log(`⚠️ CLIENT user ${userId} has no client account - cannot auto-assign supplier`);
        }
      } catch (assignmentError) {
        console.error("Error auto-assigning supplier to client:", assignmentError);
        // Don't throw error - supplier creation succeeded, assignment failed
      }
    }
    
    return newSupplier;
  } catch (error) {
    console.error("Error creating supplier:", error);
    throw new Error(`Error creating supplier: ${error.message}`);
  }
}

/**
 * Get all suppliers
 * @returns {Promise<Array>} - List of suppliers
 */
async function getAllSuppliers(search, userRole = null, userId = null) {
  try {
    // ✅ NEW: Client-specific filtering for suppliers
    let whereClause = {};
    
    // ✅ CLIENT ROLE: Show only suppliers assigned to this client
    if (userRole === "CLIENT" && userId) {
      // For CLIENT role, check if they have a client account with supplier assignments
      const clientUser = await prisma.clientUser.findFirst({
        where: { 
          user_id: userId,
          is_active: true
        },
        include: { 
          client: {
            include: {
              supplierAssignments: {
                where: { is_active: true }
              }
            }
          }
        }
      });
      
      if (clientUser?.client?.supplierAssignments?.length > 0) {
        // ✅ NEW CLIENT SYSTEM: Show only assigned suppliers
        whereClause.clientAssignments = {
          some: {
            client_id: clientUser.client.client_id,
            is_active: true
          }
        };
      } else {
        // ✅ LEGACY CLIENT: No supplier assignments, return empty array
        console.log(`⚠️ CLIENT user ${userId} has no supplier assignments - returning empty list`);
        return [];
      }
    }
    
    // ✅ WAREHOUSE_ASSISTANT ROLE: Show suppliers for assigned clients only
    if (userRole === "WAREHOUSE_ASSISTANT" && userId) {
      const assistantUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { assigned_clients: true }
      });
      
      if (assistantUser?.assigned_clients?.length > 0) {
        whereClause.clientAssignments = {
          some: {
            client_id: { in: assistantUser.assigned_clients },
            is_active: true
          }
        };
      } else {
        // No assigned clients, return empty array
        console.log(`⚠️ WAREHOUSE_ASSISTANT user ${userId} has no assigned clients - returning empty list`);
        return [];
      }
    }
    
    // ✅ OTHER ROLES (ADMIN, WAREHOUSE_INCHARGE, PHARMACIST): See all suppliers
    // No additional filtering needed
    
    // Add search filtering
    if (search) {
      whereClause.OR = [
        {
          company_name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          category: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          contact_person: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          tax_id: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          ruc: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where: whereClause,
      include: {
        country: {
          select: {
            country_id: true,
            name: true,
          },
        },
        entryOrderProducts: {
          select: {
            entry_order_product_id: true,
            entry_order: {
              select: {
                entry_order_id: true,
                entry_order_no: true,
                registration_date: true,
              }
            }
          },
          take: 5,
          orderBy: {
            entry_order: {
              registration_date: 'desc'
            }
          }
        },
        // ✅ NEW: Include client assignments for transparency
        clientAssignments: {
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
      },
      orderBy: {
        created_at: "desc",
      },
    });
    
    console.log(`📊 Supplier filtering results for role ${userRole}:`, {
      total_suppliers: suppliers.length,
      user_id: userId,
      has_search: !!search
    });
    
    return suppliers;
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    throw new Error(`Error fetching suppliers: ${error.message}`);
  }
}

/**
 * Get supplier by ID
 * @param {string} supplierId - Supplier ID
 * @returns {Promise<Object>} - Supplier data
 */
async function getSupplierById(supplierId) {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { supplier_id: supplierId },
      include: {
        country: true,
        entryOrderProducts: {
          select: {
            entry_order_product_id: true,
            product_code: true,
            serial_number: true,
            lot_series: true,
            entry_order: {
              select: {
                entry_order_id: true,
                entry_order_no: true,
                registration_date: true,
                order: {
                  select: {
                    created_at: true,
                    organisation: {
                      select: {
                        name: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            entry_order: {
              registration_date: 'desc'
            }
          }
        }
      }
    });
    
    if (!supplier) {
      throw new Error("Supplier not found");
    }
    
    return supplier;
  } catch (error) {
    console.error(`Error fetching supplier with ID ${supplierId}:`, error);
    throw new Error(`Error fetching supplier: ${error.message}`);
  }
}

/**
 * Update supplier
 * @param {string} supplierId - Supplier ID
 * @param {Object} supplierData - Updated supplier data
 * @returns {Promise<Object>} - Updated supplier
 */
async function updateSupplier(supplierId, supplierData) {
  try {
    const updatedSupplier = await prisma.supplier.update({
      where: { supplier_id: supplierId },
      data: {
        ...(supplierData.company_name !== undefined && { company_name: supplierData.company_name }),
        ...(supplierData.category !== undefined && { category: supplierData.category }),
        ...(supplierData.tax_id !== undefined && { tax_id: supplierData.tax_id }),
        ...(supplierData.registered_address !== undefined && { registered_address: supplierData.registered_address }),
        ...(supplierData.city !== undefined && { city: supplierData.city }),
        ...(supplierData.contact_no !== undefined && { contact_no: supplierData.contact_no }),
        ...(supplierData.contact_person !== undefined && { contact_person: supplierData.contact_person }),
        ...(supplierData.notes !== undefined && { notes: supplierData.notes }),
        ...(supplierData.name !== undefined && { name: supplierData.name }),
        ...(supplierData.address !== undefined && { address: supplierData.address }),
        ...(supplierData.phone !== undefined && { phone: supplierData.phone }),
        ...(supplierData.email !== undefined && { email: supplierData.email }),
        ...(supplierData.ruc !== undefined && { ruc: supplierData.ruc }),
        ...(supplierData.country_id && {
          country: {
            connect: { country_id: supplierData.country_id }
          }
        })
      },
      include: {
        country: true
      }
    });
    return updatedSupplier;
  } catch (error) {
    console.error(`Error updating supplier with ID ${supplierId}:`, error);
    throw new Error(`Error updating supplier: ${error.message}`);
  }
}

/**
 * Delete supplier
 * @param {string} supplierId - Supplier ID
 * @returns {Promise<Object>} - Deleted supplier
 */
async function deleteSupplier(supplierId) {
  try {
    const supplierWithEntryOrders = await prisma.supplier.findUnique({
      where: { supplier_id: supplierId },
      include: {
        entryOrderProducts: {
          select: { entry_order_product_id: true }
        }
      }
    });
    
    if (supplierWithEntryOrders?.entryOrderProducts?.length > 0) {
      throw new Error("Cannot delete supplier with related entry order products");
    }
    
    const deletedSupplier = await prisma.supplier.delete({
      where: { supplier_id: supplierId }
    });
    
    return deletedSupplier;
  } catch (error) {
    console.error(`Error deleting supplier with ID ${supplierId}:`, error);
    throw new Error(`Error deleting supplier: ${error.message}`);
  }
}

const getCountry = async () => {
  return prisma.country.findMany({
    orderBy: { name: 'asc' }
  });
};

const getSupplierCategories = async () => {
  try {
    const categories = await prisma.supplier.findMany({
      where: {
        category: {
          not: null
        }
      },
      select: {
        category: true
      },
      distinct: ['category'],
      orderBy: {
        category: 'asc'
      }
    });
    
    return categories.map(item => item.category).filter(Boolean);
  } catch (error) {
    console.error("Error fetching supplier categories:", error);
    return [];
  }
};

const getFormFields = async () => {
  try {
    const countries = await getCountry();
    const categories = await getSupplierCategories();
    
    return {
      countries,
      categories
    };
  } catch (error) {
    console.error("Error fetching form fields:", error);
    throw new Error(`Error fetching form fields: ${error.message}`);
  }
};

// ✅ NEW: Create client-supplier assignments
async function createClientSupplierAssignments(assignmentData) {
  try {
    const { client_id, supplier_ids, assigned_by, assignment_settings = {} } = assignmentData;
    
    // Validate client exists
    const client = await prisma.client.findUnique({
      where: { client_id },
      select: { 
        client_id: true, 
        company_name: true, 
        first_names: true, 
        last_name: true,
        client_type: true 
      }
    });
    
    if (!client) {
      throw new Error("Client not found");
    }
    
    // Validate suppliers exist
    const suppliers = await prisma.supplier.findMany({
      where: { supplier_id: { in: supplier_ids } },
      select: { supplier_id: true, company_name: true, name: true }
    });
    
    if (suppliers.length !== supplier_ids.length) {
      throw new Error("One or more suppliers not found");
    }
    
    // Create assignments
    const assignments = [];
    for (const supplier of suppliers) {
      const assignment = await prisma.clientSupplierAssignment.create({
        data: {
          client_id,
          supplier_id: supplier.supplier_id,
          assigned_by,
          client_supplier_code: assignment_settings.client_supplier_code || null,
          preferred_supplier: assignment_settings.preferred_supplier || false,
          credit_limit: assignment_settings.credit_limit || null,
          payment_terms: assignment_settings.payment_terms || null,
          notes: assignment_settings.notes || `Assigned to ${client.company_name || `${client.first_names} ${client.last_name}`}`,
          primary_contact: assignment_settings.primary_contact || null,
          contact_email: assignment_settings.contact_email || null,
          contact_phone: assignment_settings.contact_phone || null,
        },
        include: {
          client: {
            select: {
              client_id: true,
              company_name: true,
              first_names: true,
              last_name: true,
              client_type: true
            }
          },
          supplier: {
            select: {
              supplier_id: true,
              company_name: true,
              name: true,
              category: true
            }
          },
          assignedBy: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              role: { select: { name: true } }
            }
          }
        }
      });
      
      assignments.push(assignment);
    }
    
    console.log(`✅ Created ${assignments.length} supplier assignments for client ${client_id}`);
    return assignments;
  } catch (error) {
    console.error("Error creating client-supplier assignments:", error);
    throw new Error(`Error creating client-supplier assignments: ${error.message}`);
  }
}

// ✅ NEW: Get client-supplier assignments
async function getClientSupplierAssignments(client_id) {
  try {
    const assignments = await prisma.clientSupplierAssignment.findMany({
      where: { 
        client_id,
        is_active: true 
      },
      include: {
        supplier: {
          include: {
            country: true
          }
        },
        assignedBy: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            role: { select: { name: true } }
          }
        }
      },
      orderBy: [
        { preferred_supplier: 'desc' },
        { assigned_at: 'desc' }
      ]
    });
    
    return assignments;
  } catch (error) {
    console.error("Error fetching client-supplier assignments:", error);
    throw new Error(`Error fetching client-supplier assignments: ${error.message}`);
  }
}

// ✅ NEW: Remove client-supplier assignment
async function removeClientSupplierAssignment(assignment_id, removed_by) {
  try {
    const assignment = await prisma.clientSupplierAssignment.update({
      where: { assignment_id },
      data: {
        is_active: false,
        notes: `Deactivated by user ${removed_by} on ${new Date().toISOString()}`
      },
      include: {
        client: {
          select: {
            client_id: true,
            company_name: true,
            first_names: true,
            last_name: true
          }
        },
        supplier: {
          select: {
            supplier_id: true,
            company_name: true,
            name: true
          }
        }
      }
    });
    
    console.log(`✅ Removed supplier assignment: ${assignment.supplier.company_name || assignment.supplier.name} from client ${assignment.client.company_name || `${assignment.client.first_names} ${assignment.client.last_name}`}`);
    return assignment;
  } catch (error) {
    console.error("Error removing client-supplier assignment:", error);
    throw new Error(`Error removing client-supplier assignment: ${error.message}`);
  }
}

// ✅ NEW: Get available suppliers for client assignment (not yet assigned)
async function getAvailableSuppliersForClient(client_id) {
  try {
    // Get suppliers that are NOT assigned to this client
    const availableSuppliers = await prisma.supplier.findMany({
      where: {
        clientAssignments: {
          none: {
            client_id,
            is_active: true
          }
        }
      },
      include: {
        country: {
          select: {
            country_id: true,
            name: true
          }
        }
      },
      orderBy: {
        company_name: 'asc'
      }
    });
    
    return availableSuppliers;
  } catch (error) {
    console.error("Error fetching available suppliers for client:", error);
    throw new Error(`Error fetching available suppliers for client: ${error.message}`);
  }
}

module.exports = {
  createSupplier,
  getAllSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
  getFormFields,
  getSupplierCategories,
  createClientSupplierAssignments,
  getClientSupplierAssignments,
  removeClientSupplierAssignment,
  getAvailableSuppliersForClient,
};