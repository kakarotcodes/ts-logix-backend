/**
 * ✅ OPTIMIZED: Cursor-based pagination utilities for high-performance database queries
 * Replaces traditional limit/offset with cursor-based approach for better performance
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Cursor-based pagination configuration
 */
const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 5,
  CURSOR_FIELD: 'id', // Default cursor field
  SORT_ORDER: 'desc'
};

/**
 * ✅ OPTIMIZED: Cursor-based pagination for any model
 * @param {Object} options - Pagination options
 * @param {string} options.model - Prisma model name
 * @param {Object} options.where - Where conditions
 * @param {Object} options.include - Include relations
 * @param {Object} options.select - Select fields
 * @param {string} options.cursor - Cursor value for pagination
 * @param {number} options.pageSize - Number of items per page
 * @param {string} options.cursorField - Field to use for cursor
 * @param {string} options.sortOrder - Sort order (asc/desc)
 * @param {Object} options.orderBy - Additional ordering
 * @returns {Promise<Object>} Paginated results with metadata
 */
async function getCursorPaginatedResults(options) {
  const {
    model,
    where = {},
    include = {},
    select = undefined,
    cursor = null,
    pageSize = PAGINATION_CONFIG.DEFAULT_PAGE_SIZE,
    cursorField = PAGINATION_CONFIG.CURSOR_FIELD,
    sortOrder = PAGINATION_CONFIG.SORT_ORDER,
    orderBy = {}
  } = options;

  // Validate page size (moved outside try block)
  const validPageSize = Math.min(
    Math.max(pageSize, PAGINATION_CONFIG.MIN_PAGE_SIZE),
    PAGINATION_CONFIG.MAX_PAGE_SIZE
  );

  try {
    // Build cursor condition
    const cursorCondition = cursor ? {
      [cursorField]: {
        [sortOrder === 'asc' ? 'gt' : 'lt']: cursor
      }
    } : {};

    // Merge where conditions
    const whereConditions = {
      ...where,
      ...cursorCondition
    };

    // Build order by
    let orderByConditions = {
      [cursorField]: sortOrder,
      ...orderBy
    };
    // Ensure orderBy is always an array
    if (!Array.isArray(orderByConditions)) {
      orderByConditions = Object.entries(orderByConditions).map(([key, value]) => ({ [key]: value }));
    }

    // Get data with one extra item to check if there are more results
    const results = await prisma[model].findMany({
      where: whereConditions,
      include: select ? undefined : include,
      select: select,
      orderBy: orderByConditions,
      take: validPageSize + 1, // Get one extra to check for more results
    });

    // Check if there are more results
    const hasNextPage = results.length > validPageSize;
    const actualResults = hasNextPage ? results.slice(0, validPageSize) : results;

    // Get next cursor
    const nextCursor = actualResults.length > 0 
      ? actualResults[actualResults.length - 1][cursorField]
      : null;

    // Get previous cursor (first item's cursor)
    const previousCursor = actualResults.length > 0 
      ? actualResults[0][cursorField]
      : null;

    // Get total count (only if needed - this is expensive)
    // const totalCount = await prisma[model].count({ where });

    return {
      success: true,
      data: actualResults,
      pagination: {
        hasNextPage,
        hasPreviousPage: !!cursor,
        nextCursor: hasNextPage ? nextCursor : null,
        previousCursor: cursor ? previousCursor : null,
        pageSize: validPageSize,
        currentItemCount: actualResults.length,
        // totalCount, // Uncomment if total count is needed
      },
      metadata: {
        cursorField,
        sortOrder,
        query: {
          where: whereConditions,
          orderBy: orderByConditions
        }
      }
    };

  } catch (error) {
    console.error('❌ Cursor pagination error:', error);
    return {
      success: false,
      error: error.message,
      data: [],
      pagination: {
        hasNextPage: false,
        hasPreviousPage: false,
        nextCursor: null,
        previousCursor: null,
        pageSize: validPageSize,
        currentItemCount: 0
      }
    };
  }
}

/**
 * ✅ OPTIMIZED: Get paginated inventory with FIFO ordering
 * @param {Object} filters - Filter conditions
 * @param {string} cursor - Cursor for pagination
 * @param {number} pageSize - Items per page
 * @returns {Promise<Object>} Paginated inventory results
 */
async function getPaginatedInventory(filters = {}, cursor = null, pageSize = 20) {
  const where = {
    status: 'AVAILABLE',
    quality_status: 'APROBADO',
    current_quantity: { gt: 0 },
    ...filters
  };

  return await getCursorPaginatedResults({
    model: 'inventory',
    where,
    include: {
      product: {
        select: {
          product_id: true,
          name: true,
          product_code: true,
          manufacturer: true
        }
      },
      warehouse: {
        select: {
          warehouse_id: true,
          name: true
        }
      },
      allocation: {
        include: {
          entry_order_product: {
            select: {
              expiration_date: true,
              manufacturing_date: true,
              lot_series: true
            }
          }
        }
      }
    },
    cursor,
    pageSize,
    cursorField: 'inventory_id',
    sortOrder: 'asc', // FIFO ordering
    orderBy: {
      allocation: {
        entry_order_product: {
          expiration_date: 'asc' // Expire first
        }
      }
    }
  });
}

/**
 * ✅ OPTIMIZED: Get paginated departure orders with workflow status
 * @param {Object} filters - Filter conditions
 * @param {string} cursor - Cursor for pagination
 * @param {number} pageSize - Items per page
 * @returns {Promise<Object>} Paginated departure orders
 */
async function getPaginatedDepartureOrders(filters = {}, cursor = null, pageSize = 20) {
  const where = {
    ...filters
  };

  return await getCursorPaginatedResults({
    model: 'departureOrder',
    where,
    include: {
      customer: {
        select: {
          customer_id: true,
          name: true
        }
      },
      client: {
        select: {
          client_id: true,
          company_name: true,
          individual_id: true
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
          id: true,
          first_name: true,
          last_name: true,
          role: true
        }
      },
      reviewer: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          role: true
        }
      },
      dispatcher: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          role: true
        }
      },
      order: {
        select: {
          order_id: true,
          order_type: true,
          status: true,
          created_at: true,
          organisation: {
            select: {
              organisation_id: true,
              name: true
            }
          }
        }
      },
      products: {
        include: {
          product: {
            select: {
              product_id: true,
              name: true,
              product_code: true,
              manufacturer: true
            }
          }
        }
      },
      // ✅ ENHANCED: Include departure allocations with full relations
      departureAllocations: {
        include: {
          cell: {
            include: {
              warehouse: {
                select: {
                  warehouse_id: true,
                  name: true
                }
              }
            }
          },
          source_allocation: {
            include: {
              entry_order_product: {
                include: {
                  entry_order: {
                    select: {
                      entry_order_id: true,
                      entry_order_no: true
                    }
                  },
                  supplier: {
                    select: {
                      supplier_id: true,
                      company_name: true,
                      name: true,
                      contact_person: true,
                      phone: true,
                      email: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    cursor,
    pageSize,
    cursorField: 'departure_order_id',
    sortOrder: 'desc',
    orderBy: {
      registration_date: 'desc'
    }
  });
}

/**
 * ✅ OPTIMIZED: Get paginated entry orders with processing status
 * @param {Object} filters - Filter conditions
 * @param {string} cursor - Cursor for pagination
 * @param {number} pageSize - Items per page
 * @returns {Promise<Object>} Paginated entry orders
 */
async function getPaginatedEntryOrders(filters = {}, cursor = null, pageSize = 20) {
  const where = {
    ...filters
  };

  return await getCursorPaginatedResults({
    model: 'entryOrder',
    where,
    include: {
      origin: {
        select: {
          origin_id: true,
          name: true
        }
      },
      documentType: {
        select: {
          document_type_id: true,
          name: true
        }
      },
      warehouse: {
        select: {
          warehouse_id: true,
          name: true
        }
      },
      products: {
        include: {
          supplier: {
            select: {
              supplier_id: true,
              company_name: true,
              category: true,
              tax_id: true,
              registered_address: true,
              city: true,
              country_id: true,
              contact_no: true,
              contact_person: true,
              notes: true,
              name: true,
              address: true,
              email: true,
              phone: true,
              ruc: true
            }
          },
          product: {
            select: {
              product_id: true,
              name: true,
              product_code: true
            }
          }
        }
      }
    },
    cursor,
    pageSize,
    cursorField: 'entry_order_id',
    sortOrder: 'desc',
    orderBy: {
      registration_date: 'desc'
    }
  });
}

/**
 * ✅ OPTIMIZED: Get paginated audit logs with user information
 * @param {Object} filters - Filter conditions
 * @param {string} cursor - Cursor for pagination
 * @param {number} pageSize - Items per page
 * @returns {Promise<Object>} Paginated audit logs
 */
async function getPaginatedAuditLogs(filters = {}, cursor = null, pageSize = 20) {
  const where = {
    ...filters
  };

  return await getCursorPaginatedResults({
    model: 'systemAuditLog',
    where,
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
      }
    },
    cursor,
    pageSize,
    cursorField: 'audit_log_id',
    sortOrder: 'desc',
    orderBy: {
      performed_at: 'desc'
    }
  });
}

/**
 * ✅ OPTIMIZED: Get paginated products with category information
 * @param {Object} filters - Filter conditions
 * @param {string} cursor - Cursor for pagination
 * @param {number} pageSize - Items per page
 * @returns {Promise<Object>} Paginated products
 */
async function getPaginatedProducts(filters = {}, cursor = null, pageSize = 20) {
  const where = {
    ...filters
  };

  return await getCursorPaginatedResults({
    model: 'product',
    where,
    include: {
      category: {
        select: {
          category_id: true,
          name: true
        }
      },
      subcategory1: {
        select: {
          subcategory1_id: true,
          name: true
        }
      },
      subcategory2: {
        select: {
          subcategory2_id: true,
          name: true
        }
      },
      temperature_range: {
        select: {
          temperature_range_id: true,
          range: true
        }
      }
    },
    cursor,
    pageSize,
    cursorField: 'product_id',
    sortOrder: 'asc',
    orderBy: {
      name: 'asc'
    }
  });
}

/**
 * ✅ OPTIMIZED: Build search conditions for full-text search
 * @param {string} searchTerm - Search term
 * @param {Array} searchFields - Fields to search in
 * @returns {Object} Search conditions
 */
function buildSearchConditions(searchTerm, searchFields) {
  if (!searchTerm || !searchFields || searchFields.length === 0) {
    return {};
  }

  const searchConditions = {
    OR: searchFields.map(field => ({
      [field]: {
        contains: searchTerm,
        mode: 'insensitive'
      }
    }))
  };

  return searchConditions;
}

/**
 * ✅ OPTIMIZED: Build date range conditions
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} dateField - Date field name
 * @returns {Object} Date range conditions
 */
function buildDateRangeConditions(startDate, endDate, dateField = 'created_at') {
  const conditions = {};

  if (startDate) {
    conditions[dateField] = {
      ...conditions[dateField],
      gte: new Date(startDate)
    };
  }

  if (endDate) {
    conditions[dateField] = {
      ...conditions[dateField],
      lte: new Date(endDate)
    };
  }

  return conditions;
}

/**
 * ✅ OPTIMIZED: Build status filter conditions
 * @param {Array} statuses - Array of status values
 * @param {string} statusField - Status field name
 * @returns {Object} Status filter conditions
 */
function buildStatusConditions(statuses, statusField = 'status') {
  if (!statuses || statuses.length === 0) {
    return {};
  }

  return {
    [statusField]: {
      in: statuses
    }
  };
}

/**
 * ✅ OPTIMIZED: Cache frequently accessed data
 */
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * ✅ OPTIMIZED: Get cached data or fetch from database
 * @param {string} key - Cache key
 * @param {Function} fetchFunction - Function to fetch data
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise<any>} Cached or fresh data
 */
async function getCachedData(key, fetchFunction, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data;
  }

  const data = await fetchFunction();
  cache.set(key, {
    data,
    timestamp: Date.now()
  });

  return data;
}

/**
 * ✅ OPTIMIZED: Clear cache for specific key or all keys
 * @param {string} key - Cache key to clear (optional)
 */
function clearCache(key = null) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

module.exports = {
  // Core pagination functions
  getCursorPaginatedResults,
  
  // Specific model pagination functions
  getPaginatedInventory,
  getPaginatedDepartureOrders,
  getPaginatedEntryOrders,
  getPaginatedAuditLogs,
  getPaginatedProducts,
  
  // Utility functions
  buildSearchConditions,
  buildDateRangeConditions,
  buildStatusConditions,
  
  // Cache functions
  getCachedData,
  clearCache,
  
  // Configuration
  PAGINATION_CONFIG
}; 