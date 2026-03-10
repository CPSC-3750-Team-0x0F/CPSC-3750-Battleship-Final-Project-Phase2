const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;

  const result = await db.query(
    "INSERT INTO players(username) VALUES($1) RETURNING player_id",
    [username]
  );

  res.status(201).json(result.rows[0]);
};

exports.getStats = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    "SELECT total_games, total_wins, total_losses FROM players WHERE player_id=$1",
    [id]
  );

  res.json(result.rows[0]);
};