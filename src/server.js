const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
const db = require("./db");

const playerRoutes = require("./routes/playerRoutes");
const gameRoutes = require("./routes/gameRoutes");
const moveRoutes = require("./routes/moveRoutes");
const testRoutes = require("./routes/testRoutes");

const app = express();

const allowedOrigins = [
  'https://christianjohnston.dev',
  'https://anthonyfrialde.dev',
  'https://www.christianjohnston.dev',
  'https://www.anthonyfrialde.dev',
  'https://cpsc-3750-battleship-final-project-phase2-3zol.onrender.com',
  'https://cpsc-3750-battleship-final-project-phase2.onrender.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("Blocked by CORS:", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(bodyParser.json());

/* ---------------- STATIC FRONTEND ---------------- */
app.use(express.static(path.join(__dirname, "..", "client")));

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
    await db.query(
      "TRUNCATE players, games, game_players, ships, moves RESTART IDENTITY CASCADE"
    );

    res.status(200).json({ status: "reset" });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "server_error",
      message: "system reset failed"
    });
  }
});

/* ---------------- FRONTEND ROOT ---------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});