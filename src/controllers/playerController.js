const db = require("../db");

// controllers/playerController.js

const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body || {};
  const usernameRegex = /^[A-Za-z0-9_]+$/;

  if (username === undefined || username === null) {
    return res.status(400).json({
      error: "Missing required field: username"
    });
  }

  if (
    typeof username !== "string" ||
    username.length < 1 ||
    username.length > 30 ||
    !usernameRegex.test(username)
  ) {
    return res.status(400).json({
      error: "bad_request",
      message: "Invalid username"
    });
  }

  try {
    const result = await db.query(
      "INSERT INTO players (username) VALUES ($1) RETURNING player_id",
      [username]
    );

    return res.status(201).json({
      player_id: result.rows[0].player_id
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "conflict",
        message: "Username already taken"
      });
    }

    console.error("createPlayer error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "internal server error"
    });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;

  try {
    const playerRes = await db.query(
      `SELECT username, wins, losses, games_played, total_shots, total_hits
       FROM players
       WHERE player_id = $1`,
      [id]
    );

    if (playerRes.rows.length === 0) {
      return res.status(404).json({
        error: true,
        message: "player not found"
      });
    }

    const player = playerRes.rows[0];
    const total_shots = Number(player.total_shots) || 0;
    const total_hits = Number(player.total_hits) || 0;

    const accuracy =
      total_shots > 0 ? Number((total_hits / total_shots).toFixed(2)) : 0;

    return res.status(200).json({
      games_played: Number(player.games_played) || 0,
      wins: Number(player.wins) || 0,
      losses: Number(player.losses) || 0,
      total_shots,
      total_hits,
      accuracy
    });
  } catch (err) {
    console.error("getStats error:", err);
    return res.status(500).json({
      error: true,
      message: "internal server error"
    });
  }
};