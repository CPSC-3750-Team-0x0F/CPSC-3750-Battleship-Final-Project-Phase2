const express = require("express");
const router = express.Router();
const testController = require("../controllers/testController");

/**
 * We keep the routes clean. 
 * The password verification logic is handled inside the controller 
 * to ensure strict compliance with REF0069/70.
 */

// Route for revealing the board (Part 3/4)
router.get("/games/:id/board/:player_id", testController.revealBoard);

// Routes for resetting/restarting game state
// Some versions of the spec use /reset, others use /restart
router.post("/games/:id/reset", testController.resetGame);
router.post("/games/:id/restart", testController.resetGame);

// Part 4: Force Game Start
router.post("/games/:id/start", testController.startGame);

// Part 4: Force Turn Order
router.post("/games/:id/set-turn", testController.setTurn);

module.exports = router;