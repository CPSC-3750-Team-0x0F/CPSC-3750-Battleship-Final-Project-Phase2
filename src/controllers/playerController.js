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
    const player = await db.query(
      "SELECT player_id FROM players WHERE player_id=$1",
      [id]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    res.status(200).json({
      games_played: 0,
      wins: 0,
      losses: 0,
      total_shots: 0,
      total_hits: 0,
      accuracy: 0
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};