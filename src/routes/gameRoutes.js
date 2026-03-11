const express = require("express");
const router = express.Router();
const gameController = require("../controllers/gameController");

// Matches POST /api/games
router.post("/", gameController.createGame);

// Matches POST /api/games/{id}/join
router.post("/:id/join", gameController.joinGame);

// Matches GET /api/games/{id}
router.get("/:id", gameController.getGame);

module.exports = router;