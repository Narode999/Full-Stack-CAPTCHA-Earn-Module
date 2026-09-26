const jwt = require('jsonwebtoken');

function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', message: 'Authentication token is required.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Token is invalid or expired.' });
  }
}

module.exports = protect;
