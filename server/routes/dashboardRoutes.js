const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

router.use(authenticate);
router.get('/resident', authorize('resident'), ctrl.residentDashboard);
router.get('/helpdesk', authorize('helpdesk', 'committee'), ctrl.helpdeskDashboard);
router.get('/committee', authorize('committee'), ctrl.committeeDashboard);

module.exports = router;
