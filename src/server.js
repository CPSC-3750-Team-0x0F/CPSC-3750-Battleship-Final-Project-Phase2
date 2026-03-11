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
// This mounts test routes under /api/test
app.use("/api/test", testRoutes);

/* ---------------- SYSTEM RESET ---------------- */
app.post("/api/reset", async (req, res) => {
  try {
    // Order matters for deletion due to foreign keys
    await db.query("DELETE FROM moves");
    await db.query("DELETE FROM ships");
    await db.query("DELETE FROM game_players");
    await db.query("DELETE FROM games");
    await db.query("DELETE FROM players");

    res.status(200).json({ status: "reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "reset failed" });
  }
});

app.get("/", (req, res) => {
  res.send("Battleship API running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});