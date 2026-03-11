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

// POST /test/games/{gameId}/ships
router.post('/games/:gameId/ships', verifyTestMode, testController.placeShips);

// GET /test/games/{gameId}/board
router.get('/games/:gameId/board', verifyTestMode, testController.revealBoard);

// POST /test/games/{gameId}/reset
router.post('/games/:gameId/reset', verifyTestMode, testController.resetGame);

// POST /test/games/{gameId}/set-turn
router.post('/games/:gameId/set-turn', verifyTestMode, testController.setTurn);

module.exports = router;