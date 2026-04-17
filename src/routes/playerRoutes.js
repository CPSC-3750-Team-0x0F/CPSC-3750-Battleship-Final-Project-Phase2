const express = require("express");
const router = express.Router();
const playerController = require("../controllers/playerController");

router.post("/", playerController.createPlayer);
router.get("/", playerController.getAllPlayers); // Ensure this matches the new export
router.get("/:id/stats", playerController.getPlayerStats); // Check this line!

module.exports = router;