const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;

  // Validate username
  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  try {
    const result = await db.query(
      "INSERT INTO players(username) VALUES($1) RETURNING player_id",
      [username]
    );

    // Return 201 Created
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT total_games, total_wins, total_losses FROM players WHERE player_id=$1",
      [id]
    );

    // If player doesn't exist
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    const stats = result.rows[0];

    res.status(200).json({
      games_played: stats.total_games || 0,
      wins: stats.total_wins || 0,
      losses: stats.total_losses || 0,
      total_shots: 0,
      total_hits: 0,
      accuracy: 0
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};