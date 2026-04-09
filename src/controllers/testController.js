const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body || {};

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
        typeof ship.row !== "number" ||
        typeof ship.col !== "number"
      ) {
        return res.status(400).json({
          error: "bad_request",
          message: "invalid ship coordinates"
        });
      }

      if (
        ship.row < 0 ||
        ship.row >= gridSize ||
        ship.col < 0 ||
        ship.col >= gridSize
      ) {
        return res.status(400).json({
          error: "bad_request",
          message: "out of bounds"
        });
      }

      const key = `${ship.row},${ship.col}`;
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
        [id, player_id, ship.row, ship.col]
      );
    }

    await db.query("COMMIT");

    return res.status(200).json({ status: "ships_set" });
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {}
    console.error("placeShips error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params;

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
      "SELECT row, col FROM moves WHERE game_id = $1 AND hit = true ORDER BY row, col",
      [id]
    );

    return res.status(200).json({
      ships: ships.rows,
      hits: hits.rows
    });
  } catch (err) {
    console.error("revealBoard error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

exports.resetGame = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("BEGIN");

    await db.query("DELETE FROM ships WHERE game_id = $1", [id]);
    await db.query("DELETE FROM moves WHERE game_id = $1", [id]);

    await db.query(
      `UPDATE games
       SET status = 'waiting_setup',
           current_turn_index = 0,
           winner_id = NULL
       WHERE game_id = $1`,
      [id]
    );

    await db.query("COMMIT");

    return res.status(200).json({ status: "reset" });
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {}
    console.error("resetGame error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

exports.setTurn = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body || {};

  if (!player_id) {
    return res.status(400).json({
      error: "bad_request",
      message: "missing player_id"
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
      current_turn_index: turnOrder
    });
  } catch (err) {
    console.error("setTurn error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};