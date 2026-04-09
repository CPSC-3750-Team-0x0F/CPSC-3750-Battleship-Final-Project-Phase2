const express = require("express");
const router = express.Router();
const testController = require("../controllers/testcontroller");

const verifyTestMode = (req, res, next) => {
  const TEST_PASSWORD = "clemson-test-2026";
  const providedPass = req.headers["x-test-password"];

  if (providedPass !== TEST_PASSWORD) {
    return res.status(403).json({
      error: "Forbidden"
    });
  }

  next();
};

router.post("/games/:id/ships", verifyTestMode, testController.placeShips);
router.get("/games/:id/board/:player_id", verifyTestMode, testController.revealBoard);
router.post("/games/:id/reset", verifyTestMode, testController.resetGame);
router.post("/games/:id/restart", verifyTestMode, testController.resetGame);
router.post("/games/:id/set-turn", verifyTestMode, testController.setTurn);

module.exports = router;