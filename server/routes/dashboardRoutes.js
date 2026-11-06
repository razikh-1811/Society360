const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const resident = require('../controllers/dashboardController');

router.use(authenticate);
router.get('/resident', authorize('resident'), resident.residentDashboard);

module.exports = router;
