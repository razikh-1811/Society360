const router = require('express').Router();
const { z } = require('zod');
const validate = require('../middleware/validate');
const { authenticate, authorize, committeeReadOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { CATEGORIES, URGENCIES, STATUSES } = require('../models/Complaint');
const ctrl = require('../controllers/complaintController');

const id24 = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const text = z.object({
  title: z.string().trim().min(3, 'Title is too short').max(150),
  description: z.string().trim().min(10, 'Please describe the issue in a little more detail').max(2000),
  location: z.string().trim().max(100).optional().default(''),
});

router.use(authenticate);

router.post('/classify', authorize('resident'), validate(text), ctrl.classify);
router.post('/', authorize('resident'), upload.single('image'), validate(text), ctrl.create);
router.get('/mine', authorize('resident'), ctrl.listMine);
router.get('/assignees', authorize('helpdesk', 'committee'), ctrl.assignees);
router.get('/', authorize('helpdesk', 'committee'), ctrl.listAll);
router.get('/:id', ctrl.getOne);

const staff = [authorize('helpdesk', 'committee'), committeeReadOnly];
router.patch('/:id/assign', ...staff, validate(z.object({ assignedTo: id24, note: z.string().max(300).optional() })), ctrl.assign);
router.patch('/:id/category', ...staff, validate(z.object({ category: z.enum(CATEGORIES) })), ctrl.setCategory);
router.patch('/:id/urgency', ...staff, validate(z.object({ urgency: z.enum(URGENCIES) })), ctrl.setUrgency);
router.patch('/:id/status', ...staff, validate(z.object({ status: z.enum(STATUSES), note: z.string().max(300).optional() })), ctrl.setStatus);

router.post('/:id/rating', authorize('resident'), validate(z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(500).optional() })), ctrl.rate);
router.post('/:id/reopen', authorize('resident'), validate(z.object({ note: z.string().max(300).optional() })), ctrl.reopen);

module.exports = router;
