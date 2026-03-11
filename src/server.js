const express = require("express");
// Note: express.json() is now built-in, but bodyParser works fine too
const bodyParser = require("body-parser");
const db = require("./db");

const playerRoutes = require("./routes/playerRoutes");
const gameRoutes = require("./routes/gameRoutes");
const moveRoutes = require("./routes/moveRoutes");
const testRoutes = require("./routes/testRoutes");

const app = express();
app.use(bodyParser.json());

/* ---------------- API ROUTES ---------------- */
// Mounts player creation and stats
app.use("/api/players", playerRoutes);

// Mounts game creation, joining, and status
app.use("/api/games", gameRoutes);

// Mounts ship placement, firing shots, and move history
app.use("/api/games", moveRoutes);

/* ---------------- TEST ROUTES ---------------- */
// CHANGE: Added /api prefix to match contract requirements
// This allows paths like /api/test/games/:id/ships
app.use("/api/test", testRoutes);

/* ---------------- SYSTEM RESET ---------------- */
// Clears all game data from the database
app.post("/api/reset", async (req, res) => {
  try {
    // Truncate is often faster and resets IDs, but DELETE works
    // These must match your lowercase schema.sql
    await db.query("DELETE FROM moves");
    await db.query("DELETE FROM ships");
    await db.query("DELETE FROM game_players");
    await db.query("DELETE FROM games");
    await db.query("DELETE FROM players");

    // Contract Response: {"status": "reset"}
    res.status(200).json({ status: "reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "reset failed" });
  }
});

/* ---------------- HEALTH CHECK ---------------- */
app.get("/", (req, res) => {
  res.send("Battleship API running");
});

/* ---------------- SERVER ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});