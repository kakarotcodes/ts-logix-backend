const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Role hierarchy and permissions
const ROLES = {
  ADMIN: {
    level: 5,
    permissions: ['*'], // Full access to everything
    description: 'Full system access'
  },
  WAREHOUSE_INCHARGE: {
    level: 4,
    permissions: [
      'entry_orders:*',
      'departure_orders:*',
      'inventory:*',
      'cells:*',
      'warehouses:*',
      'quality_control:*',
      'reports:*',
      'users:read',
      'clients:*',
      'audit_logs:read'
    ],
    description: 'Warehouse management, approve orders, assign cells'
  },
  PHARMACIST: {
    level: 3,
    permissions: [
      'entry_orders:read',
      'departure_orders:read',
      'inventory:read,quality_control',
      'quality_control:*',
      'reports:read',
      'clients:read',
      'audit_logs:read'
    ],
    description: 'Quality control and inventory oversight'
  },
  WAREHOUSE_ASSISTANT: {
    level: 2,
    permissions: [
      'entry_orders:read,update', // Only for assigned clients
      'departure_orders:read',    // Only for assigned clients
      'inventory:read,update',    // Only for assigned clients
      'cells:read,update',        // Only for assigned clients
      'clients:read',             // Only assigned clients
      'audit_logs:read'           // Only for assigned clients
    ],
    description: 'Limited access to assigned clients only',
    clientRestricted: true
  },
  CLIENT: {
    level: 1,
    permissions: [
      'entry_orders:create,read,update', // Only own orders
      'departure_orders:read',           // Only own orders
      'inventory:read',                  // Only own inventory
      'reports:read'                     // Only own reports
    ],
    description: 'Create/update own entry orders only',
    selfRestricted: true
  }
};

// Permission checker
function hasPermission(userRole, resource, action) {
  const role = ROLES[userRole];
  if (!role) return false;
  
  // Admin has full access
  if (role.permissions.includes('*')) return true;
  
  // Check specific permissions
  const resourcePermissions = role.permissions.filter(p => 
    p.startsWith(resource + ':') || p === resource + ':*'
  );
  
  if (resourcePermissions.length === 0) return false;
  
  return resourcePermissions.some(permission => {
    const [, actions] = permission.split(':');
    return actions === '*' || actions.split(',').includes(action);
  });
}

// Middleware factory for role-based access control
function requireRole(minRole, options = {}) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Get user's role information
      const userWithRole = await prisma.user.findUnique({
        where: { id: user.id },
        include: { role: true }
      });

      if (!userWithRole || !userWithRole.role) {
        return res.status(403).json({
          success: false,
          message: 'User role not found'
        });
      }

      const userRole = userWithRole.role.name;
      const roleInfo = ROLES[userRole];

      if (!roleInfo) {
        return res.status(403).json({
          success: false,
          message: 'Invalid user role'
        });
      }

      // Check minimum role level
      if (typeof minRole === 'string') {
        const minRoleInfo = ROLES[minRole];
        if (roleInfo.level < minRoleInfo.level) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Minimum role required: ${minRole}`
          });
        }
      }

      // Check specific permission if provided
      if (options.resource && options.action) {
        if (!hasPermission(userRole, options.resource, options.action)) {
          return res.status(403).json({
            success: false,
            message: `Access denied. Permission required: ${options.resource}:${options.action}`
          });
        }
      }

      // Add role information to request
      req.userRole = {
        name: userRole,
        level: roleInfo.level,
        permissions: roleInfo.permissions,
        clientRestricted: roleInfo.clientRestricted || false,
        selfRestricted: roleInfo.selfRestricted || false,
        assignedClients: userWithRole.assigned_clients || []
      };

      next();
    } catch (error) {
      console.error('Role-based access control error:', error);
      res.status(500).json({
        success: false,
        message: 'Access control error'
      });
    }
  };
}

// Middleware to check resource ownership/assignment
function checkResourceAccess(resourceType) {
  return async (req, res, next) => {
    try {
      const userRole = req.userRole;
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'Role information not available'
        });
      }

      // Admin, Warehouse Incharge, and Pharmacist have full access
      if (['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'].includes(userRole.name)) {
        return next();
      }

      // Pharmacist has read access to all, but limited write access
      if (userRole.name === 'PHARMACIST') {
        const action = req.method.toLowerCase();
        if (['get'].includes(action) || 
            (resourceType === 'entry_orders' && ['put', 'patch'].includes(action)) ||
            (resourceType === 'quality_control' && ['post', 'put', 'patch'].includes(action))) {
          return next();
        }
      }

      // Warehouse Assistant - check client assignment
      if (userRole.name === 'WAREHOUSE_ASSISTANT' && userRole.clientRestricted) {
        const resourceId = req.params.id || req.params.entry_order_id || req.params.departure_order_id;
        
        if (resourceType === 'entry_orders' && resourceId) {
          const entryOrder = await prisma.entryOrder.findUnique({
            where: { entry_order_id: resourceId },
            include: { creator: true }
          });
          
          if (!entryOrder || !userRole.assignedClients.includes(entryOrder.creator.organisation_id)) {
            return res.status(403).json({
              success: false,
              message: 'Access denied. You can only access orders from your assigned clients.'
            });
          }
        }
        
        return next();
      }

      // Client - check ownership
      if ((userRole.name === 'CLIENT' || userRole.name === 'CLIENT_PHARMACIST') && userRole.selfRestricted) {
        const resourceId = req.params.id || req.params.entry_order_id;
        
        if (resourceType === 'entry_orders' && resourceId) {
          const entryOrder = await prisma.entryOrder.findUnique({
            where: { entry_order_id: resourceId }
          });
          
          if (!entryOrder || entryOrder.created_by !== req.user.id) {
            return res.status(403).json({
              success: false,
              message: 'Access denied. You can only access your own orders.'
            });
          }
        }
        
        return next();
      }

      // Default deny
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    } catch (error) {
      console.error('Resource access check error:', error);
      res.status(500).json({
        success: false,
        message: 'Access control error'
      });
    }
  };
}

// Helper function to filter data based on user role
async function filterDataByRole(data, userRole, resourceType) {
  if (['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'].includes(userRole.name)) {
    return data; // Full access
  }

  if (userRole.name === 'PHARMACIST') {
    return data; // Read access to all
  }

  if (userRole.name === 'WAREHOUSE_ASSISTANT' && userRole.clientRestricted) {
    // Filter by assigned clients
    if (resourceType === 'entry_orders') {
      return data.filter(item => 
        userRole.assignedClients.includes(item.creator?.organisation_id)
      );
    }
  }

  if ((userRole.name === 'CLIENT' || userRole.name === 'CLIENT_PHARMACIST') && userRole.selfRestricted) {
    // Filter by ownership
    return data.filter(item => item.created_by === userRole.userId);
  }

  return [];
}

// Middleware to get user's accessible clients
function getAccessibleClients() {
  return async (req, res, next) => {
    try {
      const userRole = req.userRole;
      if (!userRole) {
        return res.status(403).json({
          success: false,
          message: 'Role information not available'
        });
      }

      let accessibleClients = [];

      if (['ADMIN', 'WAREHOUSE_INCHARGE', 'PHARMACIST'].includes(userRole.name)) {
        // Full access to all clients
        accessibleClients = await prisma.client.findMany({
          select: { client_id: true, company_name: true, first_names: true, last_name: true }
        });
      } else if (userRole.name === 'WAREHOUSE_ASSISTANT') {
        // Only assigned clients
        accessibleClients = await prisma.client.findMany({
          where: {
            client_id: { in: userRole.assignedClients }
          },
          select: { client_id: true, company_name: true, first_names: true, last_name: true }
        });
      }

      req.accessibleClients = accessibleClients;
      next();
    } catch (error) {
      console.error('Error getting accessible clients:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving accessible clients'
      });
    }
  };
}

// ✅ NEW: Middleware to check if PHARMACIST user is client-restricted
async function checkClientRestriction(req, res, next) {
  try {
    const user = req.user;

    // Only apply to PHARMACIST and CLIENT_PHARMACIST roles
    if (!user || (user.role !== 'PHARMACIST' && user.role !== 'CLIENT_PHARMACIST')) {
      req.clientRestriction = {
        isClientRestricted: false,
        client_id: null,
        client_code: null
      };
      return next();
    }

    // Check if this PHARMACIST is linked to a specific client via ClientUser table
    const clientUser = await prisma.clientUser.findUnique({
      where: { user_id: user.id },
      include: {
        client: {
          select: {
            client_id: true,
            client_code: true,
            company_name: true,
            first_names: true,
            last_name: true
          }
        }
      }
    });

    if (clientUser && clientUser.client) {
      // This is a CLIENT PHARMACIST - restrict to their client only
      req.clientRestriction = {
        isClientRestricted: true,
        client_id: clientUser.client_id,
        client_code: clientUser.client.client_code,
        client_name: clientUser.client.company_name ||
                     `${clientUser.client.first_names || ''} ${clientUser.client.last_name || ''}`.trim()
      };
      console.log(`ℹ️ Client PHARMACIST detected: ${user.user_id} restricted to client ${clientUser.client.client_code}`);
    } else {
      // This is a WAREHOUSE PHARMACIST - no client restriction
      req.clientRestriction = {
        isClientRestricted: false,
        client_id: null,
        client_code: null
      };
      console.log(`ℹ️ Warehouse PHARMACIST detected: ${user.user_id} - full access`);
    }

    next();
  } catch (error) {
    console.error('Error checking client restriction:', error);
    // On error, fail open with no restriction (safer for warehouse PHARMACIST)
    req.clientRestriction = {
      isClientRestricted: false,
      client_id: null,
      client_code: null
    };
    next();
  }
}

module.exports = {
  ROLES,
  hasPermission,
  requireRole,
  checkResourceAccess,
  filterDataByRole,
  getAccessibleClients,
  checkClientRestriction
}; 