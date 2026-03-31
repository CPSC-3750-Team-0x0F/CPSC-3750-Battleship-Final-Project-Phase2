const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });
  
  try {
    const result = await db.query(
      "INSERT INTO players(username, wins, losses, total_shots, total_hits) VALUES($1, 0, 0, 0, 0) RETURNING player_id", 
      [username]
    );
    res.status(201).json({ player_id: result.rows[0].player_id });
  } catch (err) {
    console.error("Create Player Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Fetch lifetime stats directly from the players table
    const playerRes = await db.query(
      "SELECT username, wins, losses, total_shots, total_hits FROM players WHERE player_id = $1", 
      [id]
    );
    
    if (playerRes.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    // 2. Fetch total games joined from game_players
    const gamesPlayedRes = await db.query(
      "SELECT COUNT(*) as count FROM game_players WHERE player_id = $1", 
      [id]
    );

    const player = playerRes.rows[0];
    const total_shots = parseInt(player.total_shots) || 0;
    const total_hits = parseInt(player.total_hits) || 0;
    const wins = parseInt(player.wins) || 0;
    const losses = parseInt(player.losses) || 0;
    const games_played = parseInt(gamesPlayedRes.rows[0].count) || 0;

    // 3. Calculate accuracy: must be a float rounded to 2 decimal places
    let accuracy = 0.00;
    if (total_shots > 0) {
      accuracy = parseFloat((total_hits / total_shots).toFixed(2));
    }

    res.status(200).json({
      player_id: parseInt(id),
      username: player.username,
      wins: wins,
      losses: losses,
      total_shots: total_shots,
      total_hits: total_hits,
      games_played: games_played,
      accuracy: accuracy 
    });

  } catch (err) {
    console.error("Get Stats Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};