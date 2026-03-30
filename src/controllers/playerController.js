const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });
  
  try {
    // We initialize the persistent stats columns to 0
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
    // 1. Check if player exists and fetch persistent lifetime stats
    const playerRes = await db.query(
      "SELECT wins, losses, total_shots, total_hits FROM players WHERE player_id = $1", 
      [id]
    );
    
    if (playerRes.rows.length === 0) {
      return res.status(404).json({ error: "player not found" });
    }

    // 2. Fetch games_played from game_players (this link survives game resets)
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

    // 3. Calculate accuracy with 0.01 tolerance (using toFixed(2))
    const accuracy = total_shots > 0 
      ? parseFloat((total_hits / total_shots).toFixed(2)) 
      : 0.0;

    res.json({ 
      games_played, 
      wins, 
      losses, 
      total_shots, 
      total_hits, 
      accuracy 
    });
  } catch (err) {
    console.error("Get Stats Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};