const db = require("../db");

/**
 * Handles POST /api/players
 * Modified to support persistent accounts: 
 * If username exists, returns existing player_id (Login).
 * If username is new, creates a new record (Register).
 */
exports.createPlayer = async (req, res) => {
  const { username } = req.body || {};

  if (!username || typeof username !== 'string' || username.trim() === "") {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "invalid username" 
    });
  }

  // Regex allows letters, numbers, and underscores (consistent with your existing logic)
  if (username.length > 30 || /[^a-zA-Z0-9_]/.test(username)) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "invalid username format" 
    });
  }

  try {
    // Check if player already exists
    const existing = await db.query(
      "SELECT player_id FROM players WHERE username = $1", 
      [username]
    );

    if (existing.rows.length > 0) {
      // Login: Return existing player_id
      return res.status(200).json({ 
        player_id: Number(existing.rows[0].player_id),
        message: "Welcome back!"
      });
    }

    // Register: Create new player
    const result = await db.query(
      "INSERT INTO players (username) VALUES ($1) RETURNING player_id",
      [username]
    );
    
    return res.status(201).json({ 
      player_id: Number(result.rows[0].player_id) 
    });
  } catch (err) {
    console.error("createPlayer error:", err);
    return res.status(500).json({ error: "server_error" });
  }
};

/**
 * Handles GET /api/players/:id/stats
 * Returns the lifetime stats for a persistent account.
 */
exports.getPlayerStats = async (req, res) => {
  const { id } = req.params;

  try {
    const playerRes = await db.query(
      `SELECT player_id, username, games_played, wins, losses, total_shots, total_hits 
       FROM players WHERE player_id = $1`, 
      [id]
    );

    if (playerRes.rows.length === 0) {
      return res.status(404).json({ 
        error: "not_found", 
        message: "player not found" 
      });
    }

    const p = playerRes.rows[0];
    
    // Calculate accuracy safely
    const totalShots = Number(p.total_shots || 0);
    const totalHits = Number(p.total_hits || 0);
    const accuracy = totalShots > 0 ? Number((totalHits / totalShots).toFixed(2)) : 0.0;

    return res.status(200).json({
      player_id: Number(p.player_id),
      username: p.username,
      games_played: Number(p.games_played || 0),
      wins: Number(p.wins || 0),
      losses: Number(p.losses || 0),
      total_shots: totalShots,
      total_hits: totalHits,
      accuracy: accuracy
    });
  } catch (err) {
    console.error("getPlayerStats error:", err);
    return res.status(500).json({ error: "server_error" });
  }
};

/**
 * Handles GET /api/players
 * Useful for leaderboards or administrative views.
 */
exports.getAllPlayers = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT player_id, username, wins, losses, games_played FROM players ORDER BY wins DESC"
    );
    const players = result.rows.map(p => ({
      player_id: Number(p.player_id),
      username: p.username,
      wins: Number(p.wins || 0),
      losses: Number(p.losses || 0),
      games_played: Number(p.games_played || 0)
    }));
    return res.status(200).json(players);
  } catch (err) {
    console.error("getAllPlayers error:", err);
    return res.status(500).json({ error: "server_error" });
  }
};