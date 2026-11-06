const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again later.' },
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

router.post('/login', loginLimiter, validate(loginSchema), ctrl.login);
router.post('/demo-committee', loginLimiter, ctrl.demoCommittee);
router.get('/me', authenticate, ctrl.me);

module.exports = router;
