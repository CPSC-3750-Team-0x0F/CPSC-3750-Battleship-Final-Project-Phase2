const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;

  // Validate username
  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  try {
    // Contract Side Effect: Initializes player statistics via DEFAULT values in schema
    const result = await db.query(
      "INSERT INTO players(username) VALUES($1) RETURNING player_id",
      [username]
    );

    // Contract Response: { "player_id": 1 }
    res.status(201).json({
      player_id: result.rows[0].player_id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;

  try {
    // Pull actual stats from the database based on your schema
    const result = await db.query(
      "SELECT games_played, wins, losses, total_shots, total_hits FROM players WHERE player_id=$1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    const stats = result.rows[0];

    // Calculate accuracy: hits / shots (handle division by zero)
    const accuracy = stats.total_shots > 0 
      ? parseFloat((stats.total_hits / stats.total_shots).toFixed(3)) 
      : 0.0;

    // Contract Response: Exact keys required for the frontend
    res.status(200).json({
      games_played: stats.games_played,
      wins: stats.wins,
      losses: stats.losses,
      total_shots: stats.total_shots,
      total_hits: stats.total_hits,
      accuracy: accuracy
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};