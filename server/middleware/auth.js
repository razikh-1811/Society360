const User = require('../models/User');
const { ApiError } = require('./errorHandler');
const { verifyToken } = require('../utils/token');

// Verifies the Bearer token and loads the user. The role always comes from the DB, not the token.
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'Authentication required');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new ApiError(401, 'Invalid or expired token');
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) throw new ApiError(401, 'Account not found or disabled');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Allow only the listed roles.
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission for this action'));
  next();
};

// Committee members are strictly read-only: block every non-GET request.
const committeeReadOnly = (req, res, next) => {
  if (req.user?.role === 'committee' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next(new ApiError(403, 'Committee access is read-only'));
  }
  next();
};

// Residents may only touch their own flat. Staff/committee may access any flat.
const requireFlatAccess = (param = 'flatId') => (req, res, next) => {
  if (req.user.role !== 'resident') return next();
  const target = req.params[param];
  if (!req.user.flat || String(req.user.flat) !== String(target)) {
    return next(new ApiError(403, 'You can only access your own flat records'));
  }
  next();
};

module.exports = { authenticate, authorize, committeeReadOnly, requireFlatAccess };
