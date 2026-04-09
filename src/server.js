const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");

const playerRoutes = require("./routes/playerRoutes");
const gameRoutes = require("./routes/gameRoutes");
const moveRoutes = require("./routes/moveRoutes");
const testRoutes = require("./routes/testRoutes");

const app = express();
app.use(bodyParser.json());

/* ---------------- API ROUTES ---------------- */
app.use("/api/players", playerRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/games", moveRoutes);

/* ---------------- TEST ROUTES ---------------- */
app.use("/api/test", testRoutes);

/* ---------------- CONTRACT ENDPOINTS (v2.3) ---------------- */

app.get("/api", (req, res) => {
  res.status(200).json({
    name: "Battleship API",
    version: "2.3.0",
    spec_version: "2.3",
    environment: "production",
    test_mode: true
  });
});

app.get("/api/version", (req, res) => {
  res.status(200).json({
    api_version: "2.3.0",
    spec_version: "2.3"
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime_seconds: Math.floor(process.uptime())
  });
});

/* ---------------- SYSTEM RESET ---------------- */
app.post("/api/reset", async (req, res) => {
  try {
    // RESTART IDENTITY resets SERIAL counters to 1.
    // CASCADE handles foreign key dependencies automatically.
    await db.query("TRUNCATE players, games, game_players, ships, moves RESTART IDENTITY CASCADE");

    res.status(200).json({ status: "reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: "server_error", 
      message: "system reset failed" 
    });
  }
});

app.get("/", (req, res) => {
  res.send("Battleship API v2.3 - Clemson School of Computing");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});