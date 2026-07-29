const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const { myLeaves, applyLeave, allLeaves, reviewLeave } = require('../controllers/leaveController.js');

const router = express.Router();

router.use(requireAuth);
router.get('/mine', myLeaves);
router.post('/', applyLeave);
router.get('/', requireRole('hr', 'admin', 'superadmin'), allLeaves);
router.put('/:id/review', requireRole('admin', 'superadmin', 'hr'), reviewLeave);

// Debug/test route: preview sample employee leave rows (development helper)
router.get('/test-employee-leaves', requireRole('hr', 'admin', 'superadmin'), (req, res) => {
	const sample = [
		{ id: 1001, employeeId: 201, type: 'Casual', fromDate: '2026-07-27', toDate: '2026-07-27', reason: 'Personal', status: 'Pending', Employee: { id: 201, name: 'Alice Doe', role: 'employee' } },
		{ id: 1002, employeeId: 202, type: 'Sick', fromDate: '2026-07-28', toDate: '2026-07-28', reason: 'Fever', status: 'Pending', Employee: { id: 202, name: 'Bob Smith', role: 'employee' } },
	];
	res.json(sample);
});

module.exports = router;
