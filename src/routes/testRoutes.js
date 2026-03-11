const express = require('express');
const router = express.Router();
const testController = require("../controllers/testController");

// Security Middleware: Checks for X-Test-Mode header
const verifyTestMode = (req, res, next) => {
    const TEST_PASSWORD = "CPSC3750_GOLDEN_KEY_2026"; 
    if (req.headers['x-test-mode'] !== TEST_PASSWORD) {
        return res.status(403).json({ error: "Forbidden: Invalid Test Mode Header" });
    }
    next();
};

// POST /api/test/games/{id}/ships
// Note: Mounted at /api/test/games in server.js, so we use /:id/ships here
router.post('/:id/ships', verifyTestMode, testController.placeShips);

// GET /api/test/games/{id}/board/{player_id}
// CHANGE: Added /:player_id to the path to match the contract requirements
router.get('/:id/board/:player_id', verifyTestMode, testController.revealBoard);

// POST /api/test/games/{id}/reset
// Side Effect: Clears ships/moves and resets status to 'waiting'
router.post('/:id/reset', verifyTestMode, testController.resetGame);

// Custom helper route (not in contract, but useful for testing)
router.post('/:id/set-turn', verifyTestMode, testController.setTurn);

module.exports = router;