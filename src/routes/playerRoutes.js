const express = require("express");
const router = express.Router();
const playerController = require("../controllers/playerController");

router.post("/", playerController.createPlayer);
router.get("/:id/stats", playerController.getStats);

module.exports = router;