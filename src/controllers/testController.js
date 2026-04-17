const db = require("../db");

/**
 * Utility to ensure numeric inputs are valid integers.
 * Keeping your original implementation for consistency.
 */
const isValidInt = (val) => {
  return (typeof val === "number" && Number.isInteger(val)) || 
         (typeof val === "string" && /^\d+$/.test(val));
};

const TEST_PASSWORD = 'clemson-test-2026';

/**
 * Forces a game into the 'playing' state.
 * T0045: Part 4 Requirement - Force start game
 */
exports.startGame = async (req, res) => {
  const { id } = req.params;
  const testAuth = req.headers['x-test-password'];

  // REF0069/70: Strict Password Check
  if (!testAuth || testAuth !== TEST_PASSWORD) {
    return res.status(403).json({ 
      error: "forbidden", 
      message: "Invalid test password" 
    });
  }

  if (!isValidInt(id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid id"
    });
  }

  try {
    const gameRes = await db.query(
      "SELECT status FROM games WHERE game_id = $1",
      [id]
    );

    if (gameRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    // Update game to playing and ensure turn index starts at 0
    await db.query(
      `UPDATE games 
       SET status = 'playing', 
           current_turn_index = 0 
       WHERE game_id = $1`,
      [id]
    );

    return res.status(200).json({ 
      status: "started" 
    });
  } catch (err) {
    console.error("startGame error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

/**
 * Admin utility to bypass logic and place ships.
 * Includes your full coordinate validation logic.
 */
exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body || {};
  const testAuth = req.headers['x-test-password'];

  if (!testAuth || testAuth !== TEST_PASSWORD) {
    return res.status(403).json({ error: "forbidden", message: "Invalid test password" });
  }

  if (!isValidInt(id) || !isValidInt(player_id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid id"
    });
  }

  if (!player_id || !Array.isArray(ships)) {
    return res.status(400).json({
      error: "bad_request",
      message: "Missing player_id or ships array"
    });
  }

  try {
    const gameRes = await db.query(
      "SELECT grid_size FROM games WHERE game_id = $1",
      [id]
    );

    if (gameRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const membershipRes = await db.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    if (membershipRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "player not in game"
      });
    }

    const gridSize = Number(gameRes.rows[0].grid_size);
    const seen = new Set();

    for (const ship of ships) {
      if (
        !ship ||
        !isValidInt(ship.row) ||
        !isValidInt(ship.col)
      ) {
        return res.status(400).json({
          error: "bad_request",
          message: "invalid ship coordinates"
        });
      }

      const row = Number(ship.row);
      const col = Number(ship.col);

      if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) {
        return res.status(400).json({
          error: "bad_request",
          message: "out of bounds"
        });
      }

      const key = `${row},${col}`;
      if (seen.has(key)) {
        return res.status(400).json({
          error: "bad_request",
          message: "duplicate ship position"
        });
      }
      seen.add(key);
    }

    await db.query("BEGIN");

    await db.query(
      "DELETE FROM ships WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    for (const ship of ships) {
      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [id, player_id, Number(ship.row), Number(ship.col)]
      );
    }

    await db.query("COMMIT");

    return res.status(200).json({ status: "placed" });
  } catch (err) {
    try { await db.query("ROLLBACK"); } catch (_) {}
    console.error("placeShips error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

/**
 * Reveals ships and hits for a player.
 */
exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params;
  const testAuth = req.headers['x-test-password'];

  if (!testAuth || testAuth !== TEST_PASSWORD) {
    return res.status(403).json({ error: "forbidden", message: "Invalid test password" });
  }

  if (!isValidInt(id) || !isValidInt(player_id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid id"
    });
  }

  try {
    const gameRes = await db.query(
      "SELECT 1 FROM games WHERE game_id = $1",
      [id]
    );

    if (gameRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const membershipRes = await db.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    if (membershipRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "player not in game"
      });
    }

    const ships = await db.query(
      "SELECT row, col FROM ships WHERE game_id = $1 AND player_id = $2 ORDER BY row, col",
      [id, player_id]
    );

    const hits = await db.query(
      `SELECT m.row, m.col FROM moves m
       JOIN ships s ON m.game_id = s.game_id AND m.row = s.row AND m.col = s.col
       WHERE m.game_id = $1 AND s.player_id = $2 AND m.result = 'hit'
       ORDER BY m.row, m.col`,
      [id, player_id]
    );

    return res.status(200).json({
      player_id: Number(player_id),
      ships: ships.rows.map(s => ({ row: Number(s.row), col: Number(s.col) })),
      hits: hits.rows.map(h => ({ row: Number(h.row), col: Number(h.col) }))
    });
  } catch (err) {
    console.error("revealBoard error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

/**
 * Resets a game to initial state.
 * REF0069/70/73
 */
exports.resetGame = async (req, res) => {
  const { id } = req.params;
  const testAuth = req.headers['x-test-password'];

  if (!testAuth || testAuth !== TEST_PASSWORD) {
    return res.status(403).json({ 
      error: "forbidden", 
      message: "Invalid test password" 
    });
  }

  if (!isValidInt(id)) {
    return res.status(404).json({ error: "not_found", message: "invalid id" });
  }

  const client = await db.connect();
  try {
    const gameCheck = await client.query("SELECT 1 FROM games WHERE game_id = $1", [id]);
    if (gameCheck.rows.length === 0) {
      return res.status(404).json({ error: "not_found", message: "game not found" });
    }

    await client.query("BEGIN");
    
    await client.query("DELETE FROM ships WHERE game_id = $1", [id]);
    await client.query("DELETE FROM moves WHERE game_id = $1", [id]);

    await client.query(
      `UPDATE games 
       SET status = 'waiting_setup', 
           current_turn_index = 0, 
           winner_id = NULL 
       WHERE game_id = $1`,
      [id]
    );

    await client.query("COMMIT");
    return res.status(200).json({ status: "reset" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("resetGame error:", err);
    return res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
};

/**
 * Forces the turn to a specific player.
 */
exports.setTurn = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body || {};
  const testAuth = req.headers['x-test-password'];

  if (!testAuth || testAuth !== TEST_PASSWORD) {
    return res.status(403).json({ error: "forbidden", message: "Invalid test password" });
  }

  if (!isValidInt(id) || !isValidInt(player_id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid id"
    });
  }

  try {
    const playerRes = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    if (playerRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "player not in game"
      });
    }

    const turnOrder = Number(playerRes.rows[0].turn_order);

    await db.query(
      "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
      [turnOrder, id]
    );

    return res.status(200).json({
      status: "turn_set",
      current_turn_player_id: Number(player_id)
    });
  } catch (err) {
    console.error("setTurn error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};