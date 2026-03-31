const db = require("../db");

exports.getStats = async (req, res) => {
  const { id } = req.params;
  try {
    const playerRes = await db.query(
      "SELECT username, wins, losses, total_shots, total_hits FROM players WHERE player_id = $1", 
      [id]
    );
    
    if (playerRes.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    const gamesPlayedRes = await db.query(
      "SELECT COUNT(*) as count FROM game_players WHERE player_id = $1", 
      [id]
    );

    const player = playerRes.rows[0];
    const total_shots = parseInt(player.total_shots) || 0;
    const total_hits = parseInt(player.total_hits) || 0;

    let accuracy = 0.00;
    if (total_shots > 0) {
        // Rounding to exactly 2 decimal places
        accuracy = Math.round((total_hits / total_shots) * 100) / 100;
    }

    res.status(200).json({
      player_id: parseInt(id),
      username: player.username,
      wins: parseInt(player.wins) || 0,
      losses: parseInt(player.losses) || 0,
      total_shots: total_shots,
      total_hits: total_hits,
      games_played: parseInt(gamesPlayedRes.rows[0].count) || 0,
      accuracy: accuracy 
    });

  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};