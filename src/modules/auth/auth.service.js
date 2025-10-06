const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const eventLogger = require("../../utils/eventLogger");
require("dotenv").config(); // Load environment variables

const prisma = new PrismaClient();
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

/**
 * Registers a new user.
 */
async function registerUser(loginPayload) {
  const { userId, email, plainPassword, roleName, organisation_id } =
    loginPayload;

  try {
    console.log("Registering user with role:", roleName);

    if (!organisation_id) {
      throw new Error("Organisation ID is required.");
    }

    // Validate organisation existence
    const organisation = await prisma.organisation.findUnique({
      where: { organisation_id },
    });

    if (!organisation) {
      throw new Error("Organisation not found.");
    }

    // Find the role_id based on role name
    const role = await prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role '${roleName}' not found.`);
    }

    // Hash the password
    const passwordHash = bcrypt.hashSync(plainPassword, 10);

    // Create the user with role_id and organisation_id
    const newUser = await prisma.user.create({
      data: {
        user_id: userId,
        email,
        password_hash: passwordHash,
        role_id: role.role_id,
        organisation_id,
      },
    });

    // Log user registration
    await eventLogger.logEvent({
      userId: newUser.id,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: newUser.id,
      description: `New user registered: ${newUser.email} with role ${roleName}`,
      newValues: {
        user_id: newUser.user_id,
        email: newUser.email,
        role: roleName,
        organisation_id: newUser.organisation_id
      },
      metadata: {
        operation_type: 'USER_REGISTRATION',
        role: roleName,
        organisation_id: newUser.organisation_id
      }
    });

    console.log("✅ New user created:", newUser);
    return newUser.user_id;
  } catch (error) {
    console.error("❌ Error registering user:", error.message);
    throw new Error("Error inserting user: " + error.message);
  }
}

/**
 * Logs in a user and returns a JWT token.
 */
async function loginUser(userId, plainPassword, ipAddress = null, userAgent = null, sessionId = null) {
  try {
    // ✅ Find user by `userId` and include related data
    const user = await prisma.user.findUnique({
      where: { user_id: userId },
      include: { 
        role: true, // Include role to get role name
        clientUserAccounts: {
          include: {
            client: true // Include client data for CLIENT role users
          }
        }
      },
    });

    if (!user) {
      // Log failed login attempt
      await eventLogger.logEvent({
        userId: 'SYSTEM',
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: userId,
        description: `Failed login attempt for user ID: ${userId} - User not found`,
        metadata: {
          operation_type: 'AUTHENTICATION',
          failure_reason: 'USER_NOT_FOUND',
          attempted_user_id: userId
        },
        ipAddress,
        userAgent,
        sessionId
      });
      throw new Error("Invalid userID or password.");
    }

    // ✅ Verify password
    const isPasswordValid = bcrypt.compareSync(
      plainPassword,
      user.password_hash
    );
    if (!isPasswordValid) {
      // Log failed login attempt
      await eventLogger.logEvent({
        userId: user.id,
        action: 'USER_LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        description: `Failed login attempt for user: ${user.email} - Invalid password`,
        metadata: {
          operation_type: 'AUTHENTICATION',
          failure_reason: 'INVALID_PASSWORD',
          user_email: user.email,
          role: user.role.name
        },
        ipAddress,
        userAgent,
        sessionId
      });
      throw new Error("Invalid userID or password.");
    }

    // ✅ Get username and client data for CLIENT role users
    let username = user.user_id; // Default to user_id
    let clientData = null;

    if (user.role.name === 'CLIENT' && user.clientUserAccounts.length > 0) {
      // Get the client user account (there should be only one for a user)
      const clientUserAccount = user.clientUserAccounts[0];
      username = clientUserAccount.username; // Use the client username
      
      if (clientUserAccount.client) {
        const client = clientUserAccount.client;
        
        // Prepare client name data based on client type
        if (client.client_type === 'JURIDICO') {
          clientData = {
            client_id: client.client_id,
            client_type: client.client_type,
            name: client.company_name,
            company_type: client.company_type,
            establishment_type: client.establishment_type,
            ruc: client.ruc
          };
        } else if (client.client_type === 'NATURAL') {
          clientData = {
            client_id: client.client_id,
            client_type: client.client_type,
            name: `${client.first_names} ${client.last_name} ${client.mothers_last_name || ''}`.trim(),
            first_names: client.first_names,
            last_name: client.last_name,
            mothers_last_name: client.mothers_last_name,
            individual_id: client.individual_id
          };
        }
      }
    }

    // ✅ Generate JWT token with username and client data
    const tokenData = {
      userId: user.user_id,
      username: username,
      email: user.email,
      role: user.role.name, // Attach role name in the token
      organisation_id: user.organisation_id,
      id: user.id,
    };

    // Add client-specific data to JWT for CLIENT users
    if (user.role.name === 'CLIENT' && user.clientUserAccounts.length > 0) {
      const clientUserAccount = user.clientUserAccounts[0];
      tokenData.client_id = clientUserAccount.client_id;
      tokenData.is_primary_user = clientUserAccount.is_primary;
    }

    const token = jwt.sign(tokenData, SECRET_KEY);

    // ✅ Prepare response object
    const response = {
      token,
      username,
      role: user.role.name,
      organisation_id: user.organisation_id,
      id: user.id
    };

    // ✅ Add client data for CLIENT role users
    if (clientData) {
      response.client = clientData;
    }

    // Log successful login
    await eventLogger.logEvent({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      description: `User logged in successfully: ${user.email}${clientData ? ` (Client: ${clientData.name})` : ''}`,
      newValues: {
        login_time: new Date().toISOString(),
        username: username,
        role: user.role.name,
        organisation_id: user.organisation_id,
        client_data: clientData
      },
      metadata: {
        operation_type: 'AUTHENTICATION',
        login_method: 'PASSWORD',
        user_email: user.email,
        username: username,
        role: user.role.name,
        organisation_id: user.organisation_id,
        client_type: clientData?.client_type || null,
        client_id: clientData?.client_id || null
      },
      ipAddress,
      userAgent,
      sessionId
    });

    return response;
  } catch (error) {
    console.error("❌ Error logging in:", error.message);
    throw new Error("Login failed: " + error.message);
  }
}

/**
 * Changes user password
 */
async function changeUserPassword(userId, currentPassword, newPassword) {
  try {
    // Validate input
    if (!currentPassword || !newPassword) {
      throw new Error("Current password and new password are required");
    }

    if (newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters long");
    }

    if (currentPassword === newPassword) {
      throw new Error("New password must be different from current password");
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { name: true } }
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // Update password in User table
    await prisma.user.update({
      where: { id: userId },
      data: { password_hash: newPasswordHash }
    });

    // Log password change event
    await eventLogger.logEvent({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user.id,
      description: `User ${user.email} successfully changed their password`,
      metadata: {
        operation_type: 'SECURITY',
        action_type: 'PASSWORD_UPDATE',
        user_email: user.email,
        role: user.role.name,
        change_timestamp: new Date().toISOString()
      }
    });

    return {
      success: true,
      message: "Password changed successfully"
    };

  } catch (error) {
    console.error("Error in changeUserPassword service:", error);
    throw error;
  }
}

/**
 * Get user profile with client users (for profile page)
 */
async function getUserProfile(userId, userRole) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        organisation: true
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    const profile = {
      user: {
        id: user.id,
        user_id: user.user_id,
        email: user.email,
        role: user.role.name,
        organisation: {
          id: user.organisation.organisation_id,
          name: user.organisation.organisation_name
        }
      },
      client_users: []
    };

    // If user is a CLIENT, get all client users for their client
    if (userRole === "CLIENT") {
      // First, find the client for this user
      const clientUser = await prisma.clientUser.findFirst({
        where: { user_id: userId },
        include: { client: true }
      });

      if (clientUser) {
        profile.client = {
          id: clientUser.client.client_id,
          name: clientUser.client.name,
          client_type: clientUser.client.client_type,
          company_type: clientUser.client.company_type,
          ruc: clientUser.client.ruc
        };

        // Get all users for this client
        const allClientUsers = await prisma.clientUser.findMany({
          where: { client_id: clientUser.client_id },
          include: {
            user: {
              include: { role: true }
            }
          },
          orderBy: { created_at: 'asc' }
        });

        profile.client_users = allClientUsers.map(cu => ({
          client_user_id: cu.client_user_id,
          user_id: cu.user.user_id,
          email: cu.user.email,
          is_primary: cu.is_primary,
          status: cu.status,
          is_current_user: cu.user_id === userId,
          created_at: cu.created_at
        }));
      }
    }

    return profile;

  } catch (error) {
    console.error("Error in getUserProfile service:", error);
    throw error;
  }
}

/**
 * Change password for any client user (admin functionality)
 */
async function changeClientUserPassword(clientUserId, newPassword, changedByUserId) {
  try {
    // Validate password length
    if (newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters long");
    }

    // Get the client user to change password for
    const clientUser = await prisma.clientUser.findUnique({
      where: { client_user_id: clientUserId },
      include: {
        user: true,
        client: true
      }
    });

    if (!clientUser) {
      throw new Error("Client user not found");
    }

    // Get the user making the change
    const changingUser = await prisma.user.findUnique({
      where: { id: changedByUserId }
    });

    if (!changingUser) {
      throw new Error("Changing user not found");
    }

    // Verify that the changing user belongs to the same client
    const changingUserClient = await prisma.clientUser.findFirst({
      where: { user_id: changedByUserId }
    });

    if (!changingUserClient || changingUserClient.client_id !== clientUser.client_id) {
      throw new Error("Access denied. You can only change passwords for users in your own client organization.");
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // Update password in both tables using transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update User table
      await tx.user.update({
        where: { id: clientUser.user_id },
        data: { password_hash: newPasswordHash }
      });

      // Update ClientUser table notes
      const updatedClientUser = await tx.clientUser.update({
        where: { client_user_id: clientUserId },
        data: {
          notes: `${clientUser.notes || ''}\nPassword changed on ${new Date().toISOString()} by ${changingUser.email}`
        }
      });

      return updatedClientUser;
    });

    // Log password change event
    await eventLogger.logEvent({
      userId: changedByUserId,
      action: 'CLIENT_USER_PASSWORD_CHANGED',
      entityType: 'ClientUser',
      entityId: clientUserId,
      description: `Password changed for client user ${clientUser.user.email} by ${changingUser.email}`,
      metadata: {
        operation_type: 'SECURITY',
        action_type: 'PASSWORD_UPDATE_ADMIN',
        target_user_email: clientUser.user.email,
        changed_by_email: changingUser.email,
        client_name: clientUser.client.name,
        change_timestamp: new Date().toISOString()
      }
    });

    return {
      success: true,
      message: "Client user password changed successfully",
      data: {
        client_user_id: result.client_user_id,
        user_email: clientUser.user.email,
        changed_by: changingUser.email,
        changed_at: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error("Error in changeClientUserPassword service:", error);
    throw error;
  }
}

module.exports = { registerUser, loginUser, changeUserPassword, getUserProfile, changeClientUserPassword };
