const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });
  try {
    const result = await db.query("INSERT INTO players(username) VALUES($1) RETURNING player_id", [username]);
    res.status(201).json({ player_id: result.rows[0].player_id });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;
  try {
    const playerCheck = await db.query("SELECT 1 FROM players WHERE player_id = $1", [id]);
    if (playerCheck.rows.length === 0) return res.status(404).json({ error: "player not found" });

    const movesQuery = await db.query("SELECT COUNT(*) as total_shots, COUNT(*) FILTER (WHERE result = 'hit') as total_hits FROM moves WHERE player_id = $1", [id]);
    
    // Win calculation based on 'finished' status
    const winsQuery = await db.query(`
      SELECT COUNT(*) as wins FROM game_players gp JOIN games g ON gp.game_id = g.game_id
      WHERE gp.player_id = $1 AND g.status = 'finished'
      AND NOT EXISTS (
          SELECT 1 FROM ships s WHERE s.game_id = g.game_id AND s.player_id != $1
          AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit')
      )`, [id]);

    const finishedGamesQuery = await db.query("SELECT COUNT(*) as total_finished FROM game_players gp JOIN games g ON gp.game_id = g.game_id WHERE gp.player_id = $1 AND g.status = 'finished'", [id]);
    const gamesPlayedQuery = await db.query("SELECT COUNT(*) FROM game_players WHERE player_id = $1", [id]);

    const total_shots = parseInt(movesQuery.rows[0].total_shots) || 0;
    const total_hits = parseInt(movesQuery.rows[0].total_hits) || 0;
    const wins = parseInt(winsQuery.rows[0].wins) || 0;
    const losses = Math.max(0, (parseInt(finishedGamesQuery.rows[0].total_finished) || 0) - wins);

    res.json({ 
      games_played: parseInt(gamesPlayedQuery.rows[0].count), 
      wins, 
      losses, 
      total_shots, 
      total_hits, 
      accuracy: total_shots > 0 ? parseFloat((total_hits / total_shots).toFixed(2)) : 0.0 
    });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};