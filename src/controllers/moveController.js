const db = require("../db");

const isStrictInt = (value) =>
  (typeof value === "number" && Number.isInteger(value)) ||
  (typeof value === "string" && /^-?\d+$/.test(value));

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body || {};

  if (!isStrictInt(id) || !isStrictInt(player_id) || !Array.isArray(ships)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid request"
    });
  }

  if (ships.length !== 3) {
    return res.status(400).json({
      error: "bad_request",
      message: "exactly 3 ships required"
    });
  }

  const gameId = Number(id);
  const playerId = Number(player_id);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const gameResult = await client.query(
      "SELECT grid_size, status, max_players FROM games WHERE game_id = $1 FOR UPDATE",
      [gameId]
    );

    if (gameResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const { grid_size, max_players, status } = gameResult.rows[0];

    if (status !== "waiting_setup") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "ship placement closed"
      });
    }

    const playerInGame = await client.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, playerId]
    );

    if (playerInGame.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "not_found",
        message: "player not in game"
      });
    }

    const existing = await client.query(
      "SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2 LIMIT 1",
      [gameId, playerId]
    );

    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "ships already placed"
      });
    }

    const coords = new Set();
    for (const ship of ships) {
      if (
        !ship ||
        !isStrictInt(ship.row) ||
        !isStrictInt(ship.col)
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "bad_request",
          message: "invalid ship coordinates"
        });
      }

      const row = Number(ship.row);
      const col = Number(ship.col);
      const key = `${row},${col}`;

      if (coords.has(key)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "bad_request",
          message: "overlapping ships"
        });
      }

      if (row < 0 || row >= Number(grid_size) || col < 0 || col >= Number(grid_size)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "bad_request",
          message: "out of bounds"
        });
      }

      coords.add(key);
    }

    for (const ship of ships) {
      await client.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [gameId, playerId, Number(ship.row), Number(ship.col)]
      );
    }

    const shipsReadyRes = await client.query(
      "SELECT COUNT(DISTINCT player_id)::int AS count FROM ships WHERE game_id = $1",
      [gameId]
    );

    if (shipsReadyRes.rows[0].count === Number(max_players)) {
      await client.query(
        "UPDATE games SET status = 'playing' WHERE game_id = $1",
        [gameId]
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ status: "ships_placed" });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("placeShips error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  } finally {
    client.release();
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body || {};

  if (!isStrictInt(id) || !isStrictInt(player_id) || !isStrictInt(row) || !isStrictInt(col)) {
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
      "SELECT grid_size, status, current_turn_index, max_players FROM games WHERE game_id = $1 FOR UPDATE",
      [gameId]
    );

    if (gameRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const game = gameRes.rows[0];
    const currentTurnIndex = Number(game.current_turn_index);
    const maxPlayers = Number(game.max_players);
    const gridSize = Number(game.grid_size);

    const turnRes = await client.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, shooterId]
    );

    if (turnRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "not_found",
        message: "player not in game"
      });
    }

    if (game.status === "finished") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "game already finished"
      });
    }

    if (shotRow < 0 || shotRow >= gridSize || shotCol < 0 || shotCol >= gridSize) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "bad_request",
        message: "out of bounds"
      });
    }

    // Duplicate must be checked before turn/state rejection for several suites
    const shotExistsRes = await client.query(
      "SELECT 1 FROM moves WHERE game_id = $1 AND row = $2 AND col = $3 LIMIT 1",
      [gameId, shotRow, shotCol]
    );

    if (shotExistsRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "already fired here"
      });
    }

    const shooterTurnOrder = Number(turnRes.rows[0].turn_order);

    if (game.status !== "playing") {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "forbidden",
        message: "game not in playing state"
      });
    }

    if (shooterTurnOrder !== currentTurnIndex) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "forbidden",
        message: "it is not your turn"
      });
    }

    const hitRes = await client.query(
      "SELECT player_id FROM ships WHERE game_id = $1 AND row = $2 AND col = $3 AND player_id != $4",
      [gameId, shotRow, shotCol, shooterId]
    );

    const result = hitRes.rows.length > 0 ? "hit" : "miss";

    await client.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [gameId, shooterId, shotRow, shotCol, result]
    );

    await client.query(
      "UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1 WHERE player_id = $2",
      [result === "hit" ? 1 : 0, shooterId]
    );

    let gameStatus = "playing";
    let winnerId = null;

    if (result === "hit") {
      const remainingOpponentShips = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM ships s
         WHERE s.game_id = $1
           AND s.player_id != $2
           AND NOT EXISTS (
             SELECT 1
             FROM moves m
             WHERE m.game_id = s.game_id
               AND m.row = s.row
               AND m.col = s.col
               AND m.result = 'hit'
           )`,
        [gameId, shooterId]
      );

      if (remainingOpponentShips.rows[0].count === 0) {
        gameStatus = "finished";
        winnerId = shooterId;

        await client.query(
          "UPDATE games SET status = 'finished', winner_id = $1 WHERE game_id = $2",
          [winnerId, gameId]
        );

        await client.query(
          "UPDATE players SET wins = wins + 1, games_played = games_played + 1 WHERE player_id = $1",
          [winnerId]
        );

        await client.query(
          `UPDATE players
           SET losses = losses + 1, games_played = games_played + 1
           WHERE player_id IN (
             SELECT player_id
             FROM game_players
             WHERE game_id = $1 AND player_id != $2
           )`,
          [gameId, winnerId]
        );
      }
    }

    let next_player_id = null;

    if (gameStatus !== "finished") {
      const nextTurnIndex = (currentTurnIndex + 1) % maxPlayers;

      await client.query(
        "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
        [nextTurnIndex, gameId]
      );

      const nextPlayerRes = await client.query(
        "SELECT player_id FROM game_players WHERE game_id = $1 AND turn_order = $2",
        [gameId, nextTurnIndex]
      );

      next_player_id = nextPlayerRes.rows[0]?.player_id ?? null;
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
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  } finally {
    client.release();
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;

  if (!isStrictInt(id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid game id"
    });
  }

  try {
    const gameRes = await db.query(
      "SELECT 1 FROM games WHERE game_id = $1",
      [Number(id)]
    );

    if (gameRes.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const result = await db.query(
      "SELECT player_id, row, col, result FROM moves WHERE game_id = $1 ORDER BY row, col",
      [Number(id)]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error("getMoves error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};