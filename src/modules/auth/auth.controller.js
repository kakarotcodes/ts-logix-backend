// src/modules/authentication/auth.controller.js
const authService = require("./auth.service");

/**
 * Handle user registration
 */
async function register(req, res) {
  const { loginPayload } = req.body;
  console.log("loginPayload", loginPayload);
  const { userId, email, plainPassword, roleName, organisation_id } =
    loginPayload;

  if (!userId || !email || !plainPassword || !roleName || !organisation_id) {
    // ✅ LOG: Registration validation failure
    if (req.logEvent) {
      await req.logEvent(
        'REGISTRATION_VALIDATION_FAILED',
        'User',
        'REGISTRATION_ATTEMPT',
        `User registration validation failed: missing required fields`,
        null,
        {
          provided_fields: {
            userId: !!userId,
            email: !!email,
            plainPassword: !!plainPassword,
            roleName: !!roleName,
            organisation_id: !!organisation_id
          },
          attempted_email: email,
          attempted_role: roleName,
          attempted_organisation: organisation_id,
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          validation_timestamp: new Date().toISOString()
        },
        { operation_type: 'USER_MANAGEMENT', action_type: 'REGISTRATION_VALIDATION_FAILED' }
      );
    }
    
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // ✅ LOG: User registration process started
    if (req.logEvent) {
      await req.logEvent(
        'USER_REGISTRATION_STARTED',
        'User',
        userId,
        `Started user registration for ${email}`,
        null,
        {
          user_id: userId,
          email: email,
          role: roleName,
          organisation_id: organisation_id,
          registration_timestamp: new Date().toISOString(),
          ip_address: req.ip,
          user_agent: req.get('User-Agent')
        },
        { operation_type: 'USER_MANAGEMENT', action_type: 'REGISTRATION_START' }
      );
    }

    const newRowId = await authService.registerUser(loginPayload);

    // ✅ LOG: Successful user registration
    if (req.logEvent) {
      await req.logEvent(
        'USER_REGISTERED',
        'User',
        newRowId,
        `Successfully registered new user: ${email}`,
        null,
        {
          user_id: userId,
          database_id: newRowId,
          email: email,
          role: roleName,
          organisation_id: organisation_id,
          registered_at: new Date().toISOString(),
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          business_impact: 'NEW_USER_ACCOUNT_CREATED'
        },
        { 
          operation_type: 'USER_MANAGEMENT', 
          action_type: 'REGISTRATION_SUCCESS',
          business_impact: 'USER_ONBOARDED',
          next_steps: 'USER_CAN_LOGIN_AND_ACCESS_SYSTEM'
        }
      );
    }

    return res.status(201).json({ message: "User created", id: newRowId });
  } catch (err) {
    console.error("Registration error:", err);
    
    // ✅ LOG: User registration failure
    if (req.logError) {
      await req.logError(err, {
        controller: 'auth',
        action: 'register',
        registration_data: {
          userId: userId,
          email: email,
          role: roleName,
          organisation_id: organisation_id
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        error_context: 'USER_REGISTRATION_FAILED'
      });
    }
    
    return res.status(500).json({ message: err.message });
  }
}

/**
 * Handle user login
 */
async function login(req, res) {
  const { userId, password } = req.body;

  if (!userId || !password) {
    // ✅ LOG: Login validation failure
    if (req.logEvent) {
      await req.logEvent(
        'LOGIN_VALIDATION_FAILED',
        'User',
        userId || 'UNKNOWN',
        `Login validation failed: missing credentials`,
        null,
        {
          provided_user_id: !!userId,
          provided_password: !!password,
          attempted_user_id: userId,
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          validation_timestamp: new Date().toISOString()
        },
        { operation_type: 'AUTHENTICATION', action_type: 'LOGIN_VALIDATION_FAILED' }
      );
    }
    
    return res
      .status(400)
      .json({ message: "userId and password are required" });
  }

  try {
    // ✅ LOG: Login attempt started
    if (req.logEvent) {
      await req.logEvent(
        'LOGIN_ATTEMPT_STARTED',
        'User',
        userId,
        `Login attempt started for user ${userId}`,
        null,
        {
          user_id: userId,
          login_timestamp: new Date().toISOString(),
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          session_id: req.sessionID || `session-${Date.now()}`
        },
        { operation_type: 'AUTHENTICATION', action_type: 'LOGIN_ATTEMPT' }
      );
    }

    // Changed variable name from 'res' to 'authResult' to avoid conflict
    const authResult = await authService.loginUser(
      userId, 
      password, 
      req.ip, 
      req.get('User-Agent'), 
      req.sessionID || `session-${Date.now()}`
    );

    console.log("authResult", authResult);

    // ✅ LOG: Successful login
    if (req.logEvent) {
      await req.logEvent(
        'USER_LOGIN_SUCCESS',
        'User',
        authResult.id,
        `User ${userId} successfully logged in${authResult.client ? ` (Client: ${authResult.client.name})` : ''}`,
        null,
        {
          user_id: userId,
          database_id: authResult.id,
          username: authResult.username,
          role: authResult.role,
          organisation_id: authResult.organisation_id,
          client_data: authResult.client || null,
          login_timestamp: new Date().toISOString(),
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          session_id: req.sessionID || `session-${Date.now()}`,
          token_issued: true,
          business_impact: 'USER_SESSION_ESTABLISHED'
        },
        { 
          operation_type: 'AUTHENTICATION', 
          action_type: 'LOGIN_SUCCESS',
          business_impact: 'USER_ACCESS_GRANTED',
          next_steps: 'USER_CAN_ACCESS_AUTHORIZED_RESOURCES'
        }
      );
    }

    // ✅ Return the complete authResult with username and client data
    return res.status(200).json(authResult);
  } catch (err) {
    console.error("Login error:", err);
    
    // ✅ LOG: Login failure
    if (req.logError) {
      await req.logError(err, {
        controller: 'auth',
        action: 'login',
        login_data: {
          userId: userId,
          attempted_at: new Date().toISOString()
        },
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        session_id: req.sessionID || `session-${Date.now()}`,
        error_context: 'USER_LOGIN_FAILED',
        security_note: 'POTENTIAL_UNAUTHORIZED_ACCESS_ATTEMPT'
      });
    }
    
    // ✅ LOG: Failed login attempt (security event)
    if (req.logEvent) {
      await req.logEvent(
        'LOGIN_FAILED',
        'User',
        userId,
        `Login failed for user ${userId}: ${err.message}`,
        null,
        {
          user_id: userId,
          failure_reason: err.message,
          login_timestamp: new Date().toISOString(),
          ip_address: req.ip,
          user_agent: req.get('User-Agent'),
          session_id: req.sessionID || `session-${Date.now()}`,
          security_impact: 'UNAUTHORIZED_ACCESS_ATTEMPT'
        },
        { 
          operation_type: 'AUTHENTICATION', 
          action_type: 'LOGIN_FAILED',
          security_impact: 'POTENTIAL_SECURITY_THREAT',
          next_steps: 'MONITOR_FOR_REPEATED_ATTEMPTS'
        }
      );
    }
    
    return res.status(401).json({ 
      success: false,
      message: err.message 
    });
  }
}

/**
 * Handle password change
 */
async function changePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;
    const userId = req.user?.id;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required"
      });
    }

    const result = await authService.changeUserPassword(userId, current_password, new_password);

    return res.status(200).json(result);

  } catch (error) {
    console.error("Error in changePassword controller:", error);
    
    if (error.message.includes("Current password is incorrect")) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
        error: error.message
      });
    }

    if (error.message.includes("New password must be at least")) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
}

module.exports = { register, login, changePassword };
