const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ✅ NEW: Auto-generate unique product code with better collision handling
const generateProductCode = async () => {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate format: PRD-XXXXXXXX (8 alphanumeric characters + timestamp suffix for better uniqueness)
    const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 random chars
    const productCode = `PRD-${randomPart}${timestamp}`;
    
    // Check if this code already exists
    const existingProduct = await prisma.product.findUnique({
      where: { product_code: productCode }
    });
    
    if (!existingProduct) {
      return productCode;
    }
    
    attempts++;
    // Small delay to avoid rapid-fire collisions
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Fallback: use UUID-based code if all attempts failed
  const { v4: uuidv4 } = require('uuid');
  const fallbackCode = `PRD-${uuidv4().substring(0, 8).toUpperCase()}`;
  console.warn(`⚠️ Used fallback product code generation: ${fallbackCode}`);
  return fallbackCode;
};

const createProduct = async (data, createdByUserId = null, userRole = null) => {
  // ✅ NEW: Auto-generate product code if not provided
  if (!data.product_code) {
    data.product_code = await generateProductCode();
  } else {
    // ✅ FIXED: Check if manually provided product_code already exists
    const existingProduct = await prisma.product.findUnique({
      where: { product_code: data.product_code }
    });
    
    if (existingProduct) {
      throw new Error(`Product code "${data.product_code}" already exists. Please use a different product code or leave it empty for auto-generation.`);
    }
  }
  
  // Create the product first
  const newProduct = await prisma.product.create({
    data: {
      // ✅ REQUIRED: Product code and name
      product_code: data.product_code,
      name: data.name,
      
      // ✅ NEW: Category system fields
      category: data.category_id ? { connect: { category_id: data.category_id } } : undefined,
      subcategory1: data.subcategory1_id ? { connect: { subcategory1_id: data.subcategory1_id } } : undefined,
      subcategory2: data.subcategory2_id ? { connect: { subcategory2_id: data.subcategory2_id } } : undefined,
      
      // ✅ NEW: Enhanced product fields
      manufacturer: data.manufacturer || null,
      humidity: data.humidity || null,
      observations: data.observations || null,
      uploaded_documents: data.uploaded_documents || null,
      
      // ✅ NEW: Temperature range connection
      temperature_range: data.temperature_range_id ? { connect: { temperature_range_id: data.temperature_range_id } } : undefined,
      
      // ✅ DEPRECATED: Keep old fields for backward compatibility
      // (unit_weight and unit_volume removed)
    },
    include: {
      // ✅ NEW: Include new category relations
      category: {
        select: {
          category_id: true,
          name: true,
          description: true
        }
      },
      subcategory1: {
        select: {
          subcategory1_id: true,
          name: true,
          description: true
        }
      },
      subcategory2: {
        select: {
          subcategory2_id: true,
          name: true,
          description: true
        }
      },
      temperature_range: true,
    },
  });
  
  // ✅ NEW: Auto-assign product to CLIENT who created it
  if (userRole === "CLIENT" && createdByUserId) {
    try {
      // Find the client associated with this user using the new ClientUser table
      const clientUser = await prisma.clientUser.findFirst({
        where: { 
          user_id: createdByUserId,
          is_active: true
        },
        include: {
          client: {
            select: { client_id: true }
          }
        }
      });
      
      if (clientUser?.client) {
        // Create client-product assignment
        await prisma.clientProductAssignment.create({
          data: {
            client_id: clientUser.client.client_id,
            product_id: newProduct.product_id,
            assigned_by: createdByUserId,
            client_product_code: `C${Math.floor(Math.random() * 1000)}-${newProduct.product_code}`,
            notes: `Auto-assigned to client who created the product: ${newProduct.name}`,
            is_active: true,
          }
        });
        
        console.log(`✅ Auto-assigned product ${newProduct.product_code} to client ${clientUser.client.client_id}`);
      }
    } catch (error) {
      console.error(`⚠️ Failed to auto-assign product to client:`, error.message);
      // Don't throw error - product creation was successful, assignment failed
    }
  }
  
  return newProduct;
};

const getAllProducts = async (filters = {}, userRole = null, userId = null) => {
  const where = {};
  
  // ✅ NEW: Client-specific filtering
  if (userRole === "CLIENT" && userId) {
    // For CLIENT role, only show products assigned to this client
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
      where.clientAssignments = {
        some: {
          client_id: clientUser.client.client_id,
          is_active: true
        }
      };
    } else {
      // If client user account not found, return empty array
      return [];
    }
  }
  
  // ✅ NEW: Category-based filtering
  if (filters.category_id) {
    where.category_id = filters.category_id;
  }
  if (filters.subcategory1_id) {
    where.subcategory1_id = filters.subcategory1_id;
  }
  if (filters.subcategory2_id) {
    where.subcategory2_id = filters.subcategory2_id;
  }
  if (filters.manufacturer) {
    where.manufacturer = {
      contains: filters.manufacturer,
      mode: "insensitive",
    };
  }
  
  // ✅ DEPRECATED: Keep old filters for backward compatibility
  if (filters.storage_conditions) {
    where.storage_conditions = {
      contains: filters.storage_conditions,
      mode: "insensitive",
    };
  }
  if (filters.temperature_range_id) {
    where.temperature_range_id = filters.temperature_range_id;
  }
  if (filters.name) {
    where.name = {
      contains: filters.name,
      mode: "insensitive",
    };
  }

  return prisma.product.findMany({
    where,
    include: {
      // ✅ NEW: Include new category relations
      category: {
        select: {
          category_id: true,
          name: true,
          description: true
        }
      },
      subcategory1: {
        select: {
          subcategory1_id: true,
          name: true,
          description: true,
          category: {
            select: {
              category_id: true,
              name: true
            }
          }
        }
      },
      subcategory2: {
        select: {
          subcategory2_id: true,
          name: true,
          description: true,
          subcategory1: {
            select: {
              subcategory1_id: true,
              name: true
            }
          }
        }
      },
      temperature_range: true,
      // Removed deprecated fields: product_line, group, active_state
      clientAssignments: userRole === "CLIENT" ? {
        where: { is_active: true },
        include: {
          client: {
            select: {
              client_id: true,
              company_name: true,
              first_names: true,
              last_name: true
            }
          }
        }
      } : false,
    },
    orderBy: {
      created_at: "desc",
    },
  });
};

const getProductById = async (id) => {
  return prisma.product.findUnique({
    where: { product_id: id },
    include: {
      // ✅ NEW: Include new category relations
      category: {
        select: {
          category_id: true,
          name: true,
          description: true
        }
      },
      subcategory1: {
        select: {
          subcategory1_id: true,
          name: true,
          description: true,
          category: {
            select: {
              category_id: true,
              name: true
            }
          }
        }
      },
      subcategory2: {
        select: {
          subcategory2_id: true,
          name: true,
          description: true,
          subcategory1: {
            select: {
              subcategory1_id: true,
              name: true
            }
          }
        }
      },
      temperature_range: true,
      // active_state: { select: { name: true } }, // Removed, not a relation
      
      // ✅ NEW: Include client assignments
      clientAssignments: {
        where: { is_active: true },
        include: {
          client: {
            select: {
              client_id: true,
              company_name: true,
              first_names: true,
              last_name: true
            }
          },
          assignedBy: {
            select: {
              id: true,
              first_name: true,
              last_name: true
            }
          }
        }
      },
    },
  });
};

const updateProduct = async (id, data) => {
  return prisma.product.update({
    where: { product_id: id },
    data: {
      // ✅ NEW: Support new fields
      ...(data.product_code && { product_code: data.product_code }),
      ...(data.name && { name: data.name }),
      ...(data.category_id !== undefined && { category: data.category_id ? { connect: { category_id: data.category_id } } : { disconnect: true } }),
      ...(data.subcategory1_id !== undefined && { subcategory1: data.subcategory1_id ? { connect: { subcategory1_id: data.subcategory1_id } } : { disconnect: true } }),
      ...(data.subcategory2_id !== undefined && { subcategory2: data.subcategory2_id ? { connect: { subcategory2_id: data.subcategory2_id } } : { disconnect: true } }),
      ...(data.manufacturer !== undefined && { manufacturer: data.manufacturer }),
      ...(data.humidity !== undefined && { humidity: data.humidity }),
      ...(data.observations !== undefined && { observations: data.observations }),
      ...(data.uploaded_documents !== undefined && { uploaded_documents: data.uploaded_documents }),
      
      // ✅ DEPRECATED: Keep old fields for backward compatibility
      ...(data.temperature_range_id !== undefined && { temperature_range_id: data.temperature_range_id }),
    },
    include: {
      // ✅ NEW: Include new category relations
      category: true,
      subcategory1: {
        include: { category: true }
      },
      subcategory2: {
        include: { subcategory1: { include: { category: true } } }
      },
      temperature_range: true,
    },
  });
};

const deleteProduct = async (id) => {
  return prisma.product.delete({ where: { product_id: id } });
};

// ✅ NEW: Get product categories from database
const getProductCategories = async () => {
  const categories = await prisma.productCategory.findMany({
    select: {
      category_id: true,
      name: true,
      description: true,
      created_at: true,
      _count: {
        select: {
          subcategories1: true,
          products: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });
  
  // Move "Otros" category to the end
  const otrosIndex = categories.findIndex(cat => cat.name.toLowerCase() === 'otros');
  if (otrosIndex > -1) {
    const otrosCategory = categories.splice(otrosIndex, 1)[0];
    categories.push(otrosCategory);
  }
  
  return categories;
};

// ✅ NEW: Create product category
const createProductCategory = async (categoryData) => {
  try {
    // Check if category name already exists
    const existingCategory = await prisma.productCategory.findFirst({
      where: { name: categoryData.name }
    });
    
    if (existingCategory) {
      throw new Error(`Category "${categoryData.name}" already exists`);
    }
    
    return await prisma.productCategory.create({
      data: {
        name: categoryData.name,
        description: categoryData.description || null
      },
      select: {
        category_id: true,
        name: true,
        description: true,
        created_at: true,
        _count: {
          select: {
            subcategories1: true,
            products: true
          }
        }
      }
    });
  } catch (error) {
    console.error("Error creating product category:", error);
    throw error;
  }
};

// ✅ NEW: Get subcategories1 for a category from database
const getSubCategories1 = async (categoryId = null) => {
  const where = categoryId ? { category_id: categoryId } : {};
  return prisma.productSubCategory1.findMany({
    where,
    select: {
      subcategory1_id: true,
      name: true,
      description: true,
      created_at: true,
      category: {
        select: {
          category_id: true,
          name: true
        }
      },
      _count: {
        select: {
          subcategories2: true,
          products: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });
};

// ✅ NEW: Create subcategory1
const createSubCategory1 = async (subcategoryData) => {
  try {
    // Validate that category exists
    const category = await prisma.productCategory.findUnique({
      where: { category_id: subcategoryData.category_id }
    });
    
    if (!category) {
      throw new Error("Category not found");
    }
    
    // Check if subcategory name already exists in this category
    const existingSubcategory = await prisma.productSubCategory1.findFirst({
      where: {
        category_id: subcategoryData.category_id,
        name: subcategoryData.name
      }
    });
    
    if (existingSubcategory) {
      throw new Error(`Subcategory "${subcategoryData.name}" already exists in category "${category.name}"`);
    }
    
    return await prisma.productSubCategory1.create({
      data: {
        name: subcategoryData.name,
        description: subcategoryData.description || null,
        category_id: subcategoryData.category_id
      },
      include: {
        category: {
          select: {
            category_id: true,
            name: true
          }
        },
        _count: {
          select: {
            subcategories2: true,
            products: true
          }
        }
      }
    });
  } catch (error) {
    console.error("Error creating subcategory1:", error);
    throw error;
  }
};

// ✅ NEW: Get subcategories2 for a subcategory1 from database
const getSubCategories2 = async (subcategory1Id = null) => {
  const where = subcategory1Id ? { subcategory1_id: subcategory1Id } : {};
  return prisma.productSubCategory2.findMany({
    where,
    select: {
      subcategory2_id: true,
      name: true,
      description: true,
      created_at: true,
      subcategory1: {
        select: {
          subcategory1_id: true,
          name: true,
          category: {
            select: {
              category_id: true,
              name: true
            }
          }
        }
      },
      _count: {
        select: {
          products: true
        }
      }
    },
    orderBy: { name: 'asc' }
  });
};

// ✅ NEW: Create subcategory2
const createSubCategory2 = async (subcategoryData) => {
  try {
    // Validate that subcategory1 exists
    const subcategory1 = await prisma.productSubCategory1.findUnique({
      where: { subcategory1_id: subcategoryData.subcategory1_id },
      include: {
        category: {
          select: {
            category_id: true,
            name: true
          }
        }
      }
    });
    
    if (!subcategory1) {
      throw new Error("Subcategory1 not found");
    }
    
    // Check if subcategory2 name already exists in this subcategory1
    const existingSubcategory = await prisma.productSubCategory2.findFirst({
      where: {
        subcategory1_id: subcategoryData.subcategory1_id,
        name: subcategoryData.name
      }
    });
    
    if (existingSubcategory) {
      throw new Error(`Subcategory2 "${subcategoryData.name}" already exists in subcategory "${subcategory1.name}"`);
    }
    
    return await prisma.productSubCategory2.create({
      data: {
        name: subcategoryData.name,
        description: subcategoryData.description || null,
        subcategory1_id: subcategoryData.subcategory1_id
      },
      include: {
        subcategory1: {
          select: {
            subcategory1_id: true,
            name: true,
            category: {
              select: {
                category_id: true,
                name: true
              }
            }
          }
        },
        _count: {
          select: {
            products: true
          }
        }
      }
    });
  } catch (error) {
    console.error("Error creating subcategory2:", error);
    throw error;
  }
};

// ✅ DEPRECATED: Keep old functions for backward compatibility
const getTemperatureRanges = async () => {
  return prisma.temperatureRange.findMany();
};

const getFormFields = async () => {
  try {
    const [
      // ✅ NEW: Category system fields
      productCategories,
      subcategories1,
      subcategories2,
      temperatureRanges
    ] = await Promise.all([
      getProductCategories(),
      getSubCategories1(),
      getSubCategories2(),
      getTemperatureRanges()
    ]);

    return {
      // ✅ NEW: Category system
      productCategories: productCategories, // New healthcare categories
      subcategories1: subcategories1, // New healthcare subcategories level 1
      subcategories2: subcategories2, // New healthcare subcategories level 2
      temperatureRanges
    };
  } catch (error) {
    console.error("Error in getFormFields:", error);
    throw new Error("Failed to fetch form fields");
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  
  // ✅ NEW: Category system functions
  getProductCategories,
  createProductCategory,
  getSubCategories1,
  createSubCategory1,
  getSubCategories2,
  createSubCategory2,
  getTemperatureRanges,
  getFormFields,
};
