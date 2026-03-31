const express = require('express');
const router = express.Router();
const testController = require("../controllers/testController");

// Security Middleware: Checks for X-Test-Mode header
const verifyTestMode = (req, res, next) => {
    const TEST_PASSWORD = "clemson-test-2026"; 
    if (req.headers['x-test-password'] !== TEST_PASSWORD) {
        return res.status(403).json({ error: "Forbidden: Invalid Test Mode Header" });
    }
    next();
};

// POST /api/test/{id}/ships
router.post('/:id/ships', verifyTestMode, testController.placeShips);

// GET /api/test/{id}/board/{player_id}
router.get('/:id/board/:player_id', verifyTestMode, testController.revealBoard);

// POST /api/test/{id}/reset
// Matches the test-a.py call: requests.post(f"{BASE_URL}/test/{gid}/reset"...)
router.post('/:id/reset', verifyTestMode, testController.resetGame);

// Custom helper route
router.post('/:id/set-turn', verifyTestMode, testController.setTurn);

module.exports = router;