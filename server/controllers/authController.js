const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const { signToken } = require('../utils/token');

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, flat: u.flat });

// Constant-ish response for unknown email vs wrong password: no account enumeration.
const INVALID = 'Invalid email or password';

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new ApiError(401, INVALID);
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

// Committee demo access: passwordless, but only ever returns a read-only committee account.
async function demoCommittee(req, res, next) {
  try {
    const user = await User.findOne({ role: 'committee', isActive: true }).sort({ createdAt: 1 });
    if (!user) throw new ApiError(404, 'No committee demo account is configured');
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  await req.user.populate('flat');
  res.json({ user: { ...publicUser(req.user), flat: req.user.flat } });
}

module.exports = { login, demoCommittee, me };
