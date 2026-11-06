const router = require('express').Router();
const { authenticate, authorize, requireFlatAccess } = require('../middleware/auth');
const ctrl = require('../controllers/flatController');

router.use(authenticate);
router.get('/', authorize('helpdesk', 'committee'), ctrl.listFlats);
router.get('/:flatId', requireFlatAccess('flatId'), ctrl.getFlat);

module.exports = router;
