const router = require('express').Router();
const { authenticate, authorize, requireFlatAccess } = require('../middleware/auth');
const ctrl = require('../controllers/flatController');
const billing = require('../controllers/billingController');

router.use(authenticate);
router.get('/', authorize('helpdesk', 'committee'), ctrl.listFlats);
router.get('/:flatId', requireFlatAccess('flatId'), ctrl.getFlat);
router.get('/:flatId/bills', requireFlatAccess('flatId'), billing.listBills);
router.get('/:flatId/payments', requireFlatAccess('flatId'), billing.listPayments);
router.get('/:flatId/ledger', requireFlatAccess('flatId'), billing.getLedger);

module.exports = router;
