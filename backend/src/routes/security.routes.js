const express = require('express');
const { getThreats, getStats } = require('../controllers/security.controller');
const protect = require('../middleware/auth');

const router = express.Router();

// The monitor shows the caller's OWN security events - never a global feed,
// which would leak other users' challenge IDs and activity shape.
router.use(protect);

router.get('/threats', getThreats);
router.get('/stats', getStats);

module.exports = router;
