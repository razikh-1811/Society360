const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/billingController');

const paySchema = z.object({
  billId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid bill id'),
  amount: z.number().positive().max(10000000),
  clientRequestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'clientRequestId must be 8-64 letters, digits, - or _'),
});

router.use(authenticate);
router.post('/mock', authorize('resident'), validate(paySchema), ctrl.mockPay);
router.get('/:paymentId/receipt', ctrl.getReceipt);

module.exports = router;
