const express = require("express");
const bodyParser = require("body-parser");

const playerRoutes = require("./routes/playerRoutes");
const gameRoutes = require("./routes/gameRoutes");
const moveRoutes = require("./routes/moveRoutes");

const app = express();
app.use(bodyParser.json());

app.use("/api/players", playerRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/games", moveRoutes);

app.post("/api/reset", (req, res) => {
  res.json({ status: "reset" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});