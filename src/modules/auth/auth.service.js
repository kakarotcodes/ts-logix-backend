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

    // ✅ Generate JWT token with username
    const token = jwt.sign(
      {
        userId: user.user_id,
        username: username,
        email: user.email,
        role: user.role.name, // Attach role name in the token
        organisation_id: user.organisation_id,
        id: user.id,
      },
      SECRET_KEY
    );

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

module.exports = { registerUser, loginUser, changeUserPassword };
