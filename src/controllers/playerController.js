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
    const statsQuery = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM game_players WHERE player_id = $1) as games_played,
        (SELECT COUNT(*) FROM moves WHERE player_id = $1) as total_shots,
        (SELECT COUNT(*) FROM moves WHERE player_id = $1 AND result = 'hit') as total_hits,
        (
          SELECT COUNT(*) FROM games g
          JOIN game_players gp ON g.game_id = gp.game_id
          WHERE gp.player_id = $1 AND g.status = 'completed'
          AND EXISTS (
             SELECT 1 FROM game_players opponent 
             WHERE opponent.game_id = g.game_id AND opponent.player_id != $1
             AND NOT EXISTS (
                SELECT 1 FROM ships s
                WHERE s.game_id = g.game_id AND s.player_id = opponent.player_id
                AND NOT EXISTS (
                   SELECT 1 FROM moves m 
                   WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit'
                )
             )
          )
        ) as wins
      FROM players WHERE player_id = $1`, 
      [id]
    );

    if (statsQuery.rows.length === 0) return res.status(404).json({ error: "player not found" });

    const row = statsQuery.rows[0];
    const games_played = parseInt(row.games_played);
    const total_shots = parseInt(row.total_shots);
    const total_hits = parseInt(row.total_hits);
    const wins = parseInt(row.wins);

    const completedGames = await db.query(
        "SELECT COUNT(*) FROM games g JOIN game_players gp ON g.game_id = gp.game_id WHERE gp.player_id = $1 AND g.status = 'completed'",
        [id]
    );
    const losses = Math.max(0, parseInt(completedGames.rows[0].count) - wins);
    const accuracy = total_shots > 0 ? parseFloat((total_hits / total_shots).toFixed(2)) : 0.0;

    res.json({ games_played, wins, losses, total_shots, total_hits, accuracy });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};