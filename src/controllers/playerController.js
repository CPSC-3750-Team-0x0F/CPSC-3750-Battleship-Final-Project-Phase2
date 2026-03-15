const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: "username required" });
  }

  try {
    const result = await db.query(
      "INSERT INTO players(username) VALUES($1) RETURNING player_id",
      [username]
    );

    res.status(201).json({
      player_id: result.rows[0].player_id
    });
  } catch (err) {
    console.error("Create Player Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT games_played, wins, losses, total_shots, total_hits FROM players WHERE player_id=$1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    const stats = result.rows[0];

    // Use Coalesce or || 0 to handle potential nulls from the DB
    const shots = stats.total_shots || 0;
    const hits = stats.total_hits || 0;

    const accuracy = shots > 0 
      ? parseFloat((hits / shots).toFixed(3)) 
      : 0.0;

    res.status(200).json({
      games_played: stats.games_played || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      total_shots: shots,
      total_hits: hits,
      accuracy: accuracy
    });

  } catch (err) {
    console.error("Get Stats Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};