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

// controllers/playerController.js update
exports.getStats = async (req, res) => {
  const { id } = req.params;

  try {
    // Aggregating from moves and game_players tables ensures accuracy across identity reuse
    const statsQuery = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM game_players WHERE player_id = $1) as games_played,
        (SELECT COUNT(*) FROM moves WHERE player_id = $1) as total_shots,
        (SELECT COUNT(*) FROM moves WHERE player_id = $1 AND result = 'hit') as total_hits
      FROM players WHERE player_id = $1`, 
      [id]
    );

    if (statsQuery.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    const stats = statsQuery.rows[0];
    const shots = parseInt(stats.total_shots);
    const hits = parseInt(stats.total_hits);
    const accuracy = shots > 0 ? parseFloat((hits / shots).toFixed(3)) : 0.0;

    res.status(200).json({
      player_id: id,
      games_played: parseInt(stats.games_played),
      total_shots: shots,
      total_hits: hits,
      accuracy: accuracy
    });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};