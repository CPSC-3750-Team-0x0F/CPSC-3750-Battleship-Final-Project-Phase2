const express = require("express");
const router = express.Router();
const moveController = require("../controllers/moveController");

router.post("/:id/fire", moveController.fireShot);
router.get("/:id/moves", moveController.getMoves);
router.post("/:id/place", moveController.placeShips);

module.exports = router;