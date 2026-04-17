const db = require("../db");

const isStrictInt = (value) =>
  (typeof value === "number" && Number.isInteger(value)) ||
  (typeof value === "string" && /^-?\d+$/.test(value));

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body || {};

  // 1. Basic Type Validation
  if (!isStrictInt(id) || !isStrictInt(player_id) || !Array.isArray(ships)) {
    return res.status(400).json({ error: "bad_request", message: "invalid request" });
  }

  // FIX [REF0043]: Check ship count BEFORE database checks. 
  if (ships.length !== 3) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "You must place exactly 3 ships" 
    });
  }

  const gameId = Number(id);
  const playerId = Number(player_id);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const gameResult = await client.query(
      "SELECT grid_size, status FROM games WHERE game_id = $1 FOR UPDATE",
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "game not found" });
    }

    const { grid_size, status } = gameResult.rows[0];

    // FIX [REF0050]: Check membership BEFORE allowing ship placement
    const membershipRes = await client.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, playerId]
    );

    if (membershipRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "forbidden", message: "player not in game" });
    }

    // FIX: Guard against placing ships in a game that has already started or finished
    if (status !== 'waiting_setup') {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "bad_request", message: "cannot place ships in current game state" });
    }

    // T0123 Fix: Bounds checking
    for (const ship of ships) {
      if (ship.row < 0 || ship.row >= grid_size || ship.col < 0 || ship.col >= grid_size) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "bad_request",
          message: "Invalid ship coordinates" 
        });
      }
    }

    // T0039 Fix: Check if player already placed ships
    const existingShips = await client.query(
      "SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2 LIMIT 1",
      [gameId, playerId]
    );

    if (existingShips.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "player already placed ships"
      });
    }

    // T0136 Fix: Insert ships
    for (const ship of ships) {
      await client.query(
        "INSERT INTO ships (game_id, player_id, row, col) VALUES ($1, $2, $3, $4)",
        [gameId, playerId, ship.row, ship.col]
      );
    }

    // Check if all players have placed ships to update game status
    const playersCountRes = await client.query("SELECT COUNT(*)::int FROM game_players WHERE game_id = $1", [gameId]);
    const readyCountRes = await client.query("SELECT COUNT(DISTINCT player_id)::int FROM ships WHERE game_id = $1", [gameId]);

    const playersCount = playersCountRes.rows[0].count;
    const readyCount = readyCountRes.rows[0].count;

    if (playersCount === readyCount && playersCount >= 2) {
      await client.query("UPDATE games SET status = 'playing' WHERE game_id = $1", [gameId]);
    }

    await client.query("COMMIT");
    return res.status(200).json({ status: "placed" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("placeShips error:", err);
    return res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body || {};

  if (
    player_id === undefined ||
    row === undefined ||
    col === undefined ||
    !isStrictInt(id) ||
    !isStrictInt(player_id) ||
    !isStrictInt(row) ||
    !isStrictInt(col)
  ) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid numeric input"
    });
  }

  const gameId = Number(id);
  const shooterId = Number(player_id);
  const shotRow = Number(row);
  const shotCol = Number(col);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const gameRes = await client.query(
      "SELECT game_id, grid_size, status, current_turn_index FROM games WHERE game_id = $1 FOR UPDATE",
      [gameId]
    );

    if (gameRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "game not found" });
    }

    const game = gameRes.rows[0];
    const gridSize = Number(game.grid_size);
    const currentTurnIndex = Number(game.current_turn_index);

    if (game.status === "finished") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "bad_request", message: "game already finished" });
    }

    if (game.status !== "playing") {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "forbidden", message: "game not in playing state" });
    }

    const membershipRes = await client.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, shooterId]
    );

    if (membershipRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "player not in game" });
    }

    const shooterTurnOrder = Number(membershipRes.rows[0].turn_order);

    if (shooterTurnOrder !== currentTurnIndex) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "forbidden", message: "not your turn" });
    }

    if (shotRow < 0 || shotRow >= gridSize || shotCol < 0 || shotCol >= gridSize) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "bad_request", message: "out of bounds" });
    }

    const shotExistsRes = await client.query(
      "SELECT 1 FROM moves WHERE game_id = $1 AND player_id = $2 AND row = $3 AND col = $4 LIMIT 1",
      [gameId, shooterId, shotRow, shotCol]
    );
    
    if (shotExistsRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "conflict", message: "already fired here" });
    }

    const hitRes = await client.query(
      `SELECT player_id FROM ships 
       WHERE game_id = $1 AND row = $2 AND col = $3 AND player_id != $4`,
      [gameId, shotRow, shotCol, shooterId]
    );

    const result = hitRes.rows.length > 0 ? "hit" : "miss";

    await client.query(
      "INSERT INTO moves (game_id, player_id, row, col, result) VALUES ($1, $2, $3, $4, $5)",
      [gameId, shooterId, shotRow, shotCol, result]
    );

    await client.query(
      "UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1 WHERE player_id = $2",
      [result === "hit" ? 1 : 0, shooterId]
    );

    let gameStatus = "playing";
    let winnerId = null;
    let next_player_id = null;

    const playersRes = await client.query(
      "SELECT player_id, turn_order FROM game_players WHERE game_id = $1 ORDER BY turn_order",
      [gameId]
    );

    const players = playersRes.rows.map(p => ({
      player_id: Number(p.player_id),
      turn_order: Number(p.turn_order)
    }));

    const alivePlayers = [];
    for (const p of players) {
      const remainingShipsRes = await client.query(
        `SELECT COUNT(*)::int AS count FROM ships s
         WHERE s.game_id = $1 AND s.player_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM moves m 
           WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit'
         )`,
        [gameId, p.player_id]
      );
      if (Number(remainingShipsRes.rows[0].count) > 0) {
        alivePlayers.push(p);
      }
    }

    if (alivePlayers.length === 1) {
      gameStatus = "finished";
      winnerId = alivePlayers[0].player_id;

      await client.query(
        "UPDATE games SET status = 'finished', winner_id = $1 WHERE game_id = $2",
        [winnerId, gameId]
      );

      await client.query("UPDATE players SET wins = wins + 1, games_played = games_played + 1 WHERE player_id = $1", [winnerId]);
      await client.query(
        "UPDATE players SET losses = losses + 1, games_played = games_played + 1 WHERE player_id IN (SELECT player_id FROM game_players WHERE game_id = $1 AND player_id != $2)",
        [gameId, winnerId]
      );
    } else {
      const currentIdx = players.findIndex(p => p.turn_order === currentTurnIndex);
      const nextIdx = (currentIdx + 1) % players.length;
      const nextTurnIndex = players[nextIdx].turn_order;
      next_player_id = players[nextIdx].player_id;

      await client.query(
        "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
        [nextTurnIndex, gameId]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({
      result,
      next_player_id,
      game_status: gameStatus,
      winner_id: winnerId
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("fireShot error:", err);
    return res.status(500).json({ error: "server_error", message: "database error" });
  } finally {
    client.release();
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;

  if (!isStrictInt(id)) {
    return res.status(400).json({ error: "bad_request", message: "invalid game id" });
  }

  try {
    const gameRes = await db.query("SELECT 1 FROM games WHERE game_id = $1", [Number(id)]);
    if (gameRes.rows.length === 0) {
      return res.status(404).json({ error: "not_found", message: "game not found" });
    }

    const result = await db.query(
      "SELECT player_id, row, col, result FROM moves WHERE game_id = $1 ORDER BY move_id ASC",
      [Number(id)]
    );

    return res.status(200).json(result.rows.map(row => ({
      player_id: Number(row.player_id),
      row: Number(row.row),
      col: Number(row.col),
      result: row.result
    })));
  } catch (err) {
    console.error("getMoves error:", err);
    return res.status(500).json({ error: "server_error", message: "database error" });
  }
};