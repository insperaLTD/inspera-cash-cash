const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be configured before starting the server');
}

// Verify JWT token
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'נדרשת התחברות' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'טוקן לא תקין או פג תוקף' });
  }
}

// Require manager role
function requireManager(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'manager') {
      return res.status(403).json({ error: 'נדרשות הרשאות מנהל' });
    }
    next();
  });
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, display_name: user.display_name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = { requireAuth, requireManager, signToken };
