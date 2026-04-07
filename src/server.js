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
// Supporting both /api/test/:id and /api/test/games/:id 
app.use("/api/test", testRoutes);
app.use("/api/test/games", testRoutes);

/* ---------------- CONTRACT ENDPOINTS (v2.3) ---------------- */

/**
 * GET /api
 * Returns system metadata as required by the Ultra Contract
 */
app.get("/api", (req, res) => {
  res.status(200).json({
    name: "Battleship API",
    version: "2.3.0",
    spec_version: "2.3",
    environment: "production",
    test_mode: true
  });
});

/**
 * GET /api/version
 * Official version info endpoint
 */
app.get("/api/version", (req, res) => {
  res.status(200).json({
    api_version: "2.3.0",
    spec_version: "2.3"
  });
});

/**
 * GET /api/health
 * Standardized health check for distributed systems
 */
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime_seconds: Math.floor(process.uptime())
  });
});

/* ---------------- SYSTEM RESET ---------------- */
app.post("/api/reset", async (req, res) => {
  try {
    await db.query("DELETE FROM moves");
    await db.query("DELETE FROM ships");
    await db.query("DELETE FROM game_players");
    await db.query("DELETE FROM games");
    await db.query("DELETE FROM players");

    res.status(200).json({ status: "reset" });
  } catch (err) {
    console.error(err);
    // Standardized error format: { error, message }
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