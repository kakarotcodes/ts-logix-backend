const jwt = require("jsonwebtoken");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

/**
 * Middleware to authenticate requests using JWT.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];

  // ✅ Extract token from `Authorization: Bearer {token}`
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  // ✅ Verify token
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token." });
    }

    req.user = user; // ✅ Attach decoded user data to request

    // ✅ Set up client restriction for CLIENT and CLIENT_PHARMACIST users
    if ((user.role === 'CLIENT' || user.role === 'CLIENT_PHARMACIST') && user.client_id) {
      req.clientRestriction = {
        isClientRestricted: true,
        client_id: user.client_id
      };
    }

    next(); // ✅ Proceed to the next middleware or controller
  });
}

module.exports = authenticateToken;
