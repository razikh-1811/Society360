const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate, authorize, committeeReadOnly } = require('../middleware/auth');
const ctrl = require('../controllers/reconciliationController');

const uploadSchema = z.object({
  filename: z.string().trim().max(200).default('statement.csv'),
  rows: z.array(z.record(z.string(), z.any())).min(1, 'The CSV has no rows').max(5000, 'Maximum 5000 rows per upload'),
});
const resolveSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), flatId: z.string().regex(/^[a-f\d]{24}$/i), billId: z.string().regex(/^[a-f\d]{24}$/i).optional() }),
  z.object({ action: z.literal('reject') }),
]);

router.use(authenticate, authorize('helpdesk', 'committee'), committeeReadOnly);
router.post('/upload', validate(uploadSchema), ctrl.upload);
router.get('/transactions', ctrl.listTransactions);
router.get('/batches', ctrl.listBatches);
router.get('/batches/:batchId', ctrl.getBatch);
router.get('/search-flats', ctrl.searchFlats);
router.post('/transactions/:id/resolve', validate(resolveSchema), ctrl.resolve);

module.exports = router;
