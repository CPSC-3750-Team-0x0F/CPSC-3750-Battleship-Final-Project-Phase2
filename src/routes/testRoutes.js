const express = require('express');
const router = express.Router();
const testController = require("../controllers/testController");

const verifyTestMode = (req, res, next) => {
    const TEST_PASSWORD = "clemson-test-2026"; 
    // Handle both lowercase and Title Case headers from different test scripts
    const providedPass = req.headers['x-test-password'] || req.headers['X-Test-Password'];
    if (providedPass !== TEST_PASSWORD) {
        return res.status(403).json({ error: "Forbidden: Invalid Test Mode Header" });
    }
    next();
};

router.post('/:id/ships', verifyTestMode, testController.placeShips);
router.get('/:id/board/:player_id', verifyTestMode, testController.revealBoard);

// Support both /reset (test-a.py) and /restart (final-checkpoint-tests.py)
router.post('/:id/reset', verifyTestMode, testController.resetGame);
router.post('/:id/restart', verifyTestMode, testController.resetGame);

router.post('/:id/set-turn', verifyTestMode, testController.setTurn);

module.exports = router;