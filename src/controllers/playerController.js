const db = require("../db");

/**
 * Handles POST /api/players
 * Persistent account behavior:
 * - If username exists, return existing player_id and username
 * - If username is new, create the player and return player_id and username
 */
exports.createPlayer = async (req, res) => {
  const { username } = req.body || {};

  if (!username || typeof username !== "string" || username.trim() === "") {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid username"
    });
  }

  const trimmedUsername = username.trim();

  // Allow letters, numbers, and underscores only
  if (trimmedUsername.length > 30 || /[^a-zA-Z0-9_]/.test(trimmedUsername)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid username format"
    });
  }

  try {
    const existing = await db.query(
      "SELECT player_id, username FROM players WHERE username = $1",
      [trimmedUsername]
    );

    if (existing.rows.length > 0) {
      return res.status(200).json({
        player_id: Number(existing.rows[0].player_id),
        username: existing.rows[0].username,
        message: "Welcome back!"
      });
    }

    const result = await db.query(
      "INSERT INTO players (username) VALUES ($1) RETURNING player_id, username",
      [trimmedUsername]
    );

    return res.status(201).json({
      player_id: Number(result.rows[0].player_id),
      username: result.rows[0].username,
      message: "Player created"
    });
  } catch (err) {
    console.error("createPlayer error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "failed to create player"
    });
  }
};

/**
 * Handles GET /api/players/:id/stats
 * Returns lifetime stats for a persistent account.
 */
exports.getPlayerStats = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid player id"
    });
  }

  try {
    const playerRes = await db.query(
      `SELECT player_id, username, games_played, wins, losses, total_shots, total_hits
       FROM players
       WHERE player_id = $1`,
      [id]
    );

    if (playerRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "player not found"
      });
    }

    const p = playerRes.rows[0];
    const totalShots = Number(p.total_shots || 0);
    const totalHits = Number(p.total_hits || 0);

    // Percentage accuracy
    const accuracy =
      totalShots > 0 ? Number(((totalHits / totalShots) * 100).toFixed(2)) : 0.0;

    return res.status(200).json({
      player_id: Number(p.player_id),
      username: p.username,
      games_played: Number(p.games_played || 0),
      wins: Number(p.wins || 0),
      losses: Number(p.losses || 0),
      total_shots: totalShots,
      total_hits: totalHits,
      accuracy
    });
  } catch (err) {
    console.error("getPlayerStats error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "failed to fetch player stats"
    });
  }
};

/**
 * Handles GET /api/players
 * Useful for leaderboards or administrative views.
 */
exports.getAllPlayers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT player_id, username, wins, losses, games_played, total_shots, total_hits
       FROM players
       ORDER BY wins DESC, games_played DESC, username ASC`
    );

    const players = result.rows.map((p) => {
      const totalShots = Number(p.total_shots || 0);
      const totalHits = Number(p.total_hits || 0);
      const accuracy =
        totalShots > 0 ? Number(((totalHits / totalShots) * 100).toFixed(2)) : 0.0;

      return {
        player_id: Number(p.player_id),
        username: p.username,
        wins: Number(p.wins || 0),
        losses: Number(p.losses || 0),
        games_played: Number(p.games_played || 0),
        total_shots: totalShots,
        total_hits: totalHits,
        accuracy
      };
    });

    return res.status(200).json(players);
  } catch (err) {
    console.error("getAllPlayers error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "failed to fetch players"
    });
  }
};