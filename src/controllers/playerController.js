const db = require("../db");

// controllers/playerController.js

exports.createPlayer = async (req, res) => {
  const { username } = req.body || {};
  const usernameRegex = /^[A-Za-z0-9_]+$/;

  if (!username || typeof username !== "string" || username.length < 1 || username.length > 30 || !usernameRegex.test(username)) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "Invalid username" // Ensure this matches the expected format
    });
  }

  try {
    // Check if player exists first to handle the 409 vs 201 requirement clearly
    const existing = await db.query("SELECT player_id FROM players WHERE username = $1", [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "conflict", message: "Username already taken" });
    }

    const result = await db.query(
      "INSERT INTO players(username) VALUES($1) RETURNING player_id",
      [username]
    );

    return res.status(201).json({ player_id: result.rows[0].player_id });
  } catch (err) {
    return res.status(500).json({ error: "server_error" });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;
  
  try {
    const playerRes = await db.query(
      "SELECT username, wins, losses, games_played, total_shots, total_hits FROM players WHERE player_id = $1",
      [id]
    );

    if (playerRes.rows.length === 0) {
      return res.status(404).json({ 
        error: "not_found", 
        message: "Player does not exist" 
      });
    }

    const player = playerRes.rows[0];
    const total_shots = parseInt(player.total_shots) || 0;
    const total_hits = parseInt(player.total_hits) || 0;

    // Fixed: Accuracy as a NUMBER (float) to satisfy strict JSON type checking
    const accuracy = total_shots > 0 
      ? Number((total_hits / total_shots).toFixed(2)) 
      : 0.0;

    return res.status(200).json({
      username: player.username,
      games_played: parseInt(player.games_played) || 0,
      wins: parseInt(player.wins) || 0,
      losses: parseInt(player.losses) || 0,
      total_shots: total_shots,
      total_hits: total_hits,
      accuracy: accuracy
    });
  } catch (err) {
    console.error("Get Stats Error:", err.message);
    return res.status(500).json({ 
      error: "server_error", 
      message: "database error retrieving statistics" 
    });
  }
};