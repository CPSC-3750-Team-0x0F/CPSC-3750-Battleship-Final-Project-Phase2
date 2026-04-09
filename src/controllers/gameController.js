const db = require("../db");

const isStrictInt = (value) =>
  (typeof value === "number" && Number.isInteger(value)) ||
  (typeof value === "string" && /^\d+$/.test(value));

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body || {};

  if (
    creator_id === undefined ||
    grid_size === undefined ||
    max_players === undefined
  ) {
    return res.status(400).json({
      error: "bad_request",
      message: "missing required fields"
    });
  }

  if (!isStrictInt(creator_id) || !isStrictInt(grid_size) || !isStrictInt(max_players)) {
    return res.status(400).json({
      error: "bad_request",
      message: "missing required fields"
    });
  }

  const creatorId = Number(creator_id);
  const gridSize = Number(grid_size);
  const maxPlayers = Number(max_players);

  if (gridSize < 5 || gridSize > 15) {
    return res.status(400).json({
      error: "bad_request",
      message: "grid size must be between 5 and 15"
    });
  }

  if (maxPlayers < 2 || maxPlayers > 10) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid max players"
    });
  }

  try {
    const playerCheck = await db.query(
      "SELECT 1 FROM players WHERE player_id = $1",
      [creatorId]
    );

    if (playerCheck.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "player does not exist"
      });
    }

    await db.query("BEGIN");

    const gameResult = await db.query(
      `INSERT INTO games (creator_id, grid_size, max_players, status, current_turn_index)
       VALUES ($1, $2, $3, 'waiting_setup', 0)
       RETURNING game_id, grid_size, status`,
      [creatorId, gridSize, maxPlayers]
    );

    const game = gameResult.rows[0];

    await db.query(
      `INSERT INTO game_players (game_id, player_id, turn_order)
       VALUES ($1, $2, $3)`,
      [game.game_id, creatorId, 0]
    );

    await db.query("COMMIT");

    return res.status(201).json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status
    });
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {}
    console.error("createGame error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

exports.joinGame = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body || {};

  if (!isStrictInt(id) || !isStrictInt(player_id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "player_id required"
    });
  }

  const gameId = Number(id);
  const playerId = Number(player_id);

  try {
    await db.query("BEGIN");

    const playerRes = await db.query(
      "SELECT 1 FROM players WHERE player_id = $1",
      [playerId]
    );

    if (playerRes.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        error: "not_found",
        message: "player does not exist"
      });
    }

    const gameRes = await db.query(
      "SELECT * FROM games WHERE game_id = $1",
      [gameId]
    );

    if (gameRes.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const game = gameRes.rows[0];

    if (game.status !== "waiting_setup") {
      await db.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "game already started"
      });
    }

    const alreadyJoined = await db.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, playerId]
    );

    if (alreadyJoined.rows.length > 0) {
      await db.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "player already joined"
      });
    }

    const countRes = await db.query(
      "SELECT COUNT(*)::int AS count FROM game_players WHERE game_id = $1",
      [gameId]
    );

    const currentCount = countRes.rows[0].count;

    if (currentCount >= Number(game.max_players)) {
      await db.query("ROLLBACK");
      return res.status(409).json({
        error: "conflict",
        message: "game full"
      });
    }

    await db.query(
      `INSERT INTO game_players (game_id, player_id, turn_order)
       VALUES ($1, $2, $3)`,
      [gameId, playerId, currentCount]
    );

    await db.query("COMMIT");

    return res.status(200).json({
      status: "joined",
      turn_order: currentCount
    });
  } catch (err) {
    try {
      await db.query("ROLLBACK");
    } catch (_) {}
    console.error("joinGame error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};

exports.getGame = async (req, res) => {
  const { id } = req.params;

  if (!isStrictInt(id)) {
    return res.status(400).json({
      error: "bad_request",
      message: "invalid game id"
    });
  }

  try {
    const result = await db.query(
      `SELECT
         g.game_id,
         g.grid_size,
         g.status,
         g.current_turn_index,
         g.max_players,
         COUNT(gp.player_id)::int AS active_players
       FROM games g
       LEFT JOIN game_players gp ON g.game_id = gp.game_id
       WHERE g.game_id = $1
       GROUP BY g.game_id, g.grid_size, g.status, g.current_turn_index, g.max_players`,
      [Number(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "not_found",
        message: "game not found"
      });
    }

    const game = result.rows[0];

    return res.status(200).json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index,
      max_players: game.max_players,
      active_players: game.active_players
    });
  } catch (err) {
    console.error("getGame error:", err);
    return res.status(500).json({
      error: "server_error",
      message: "database error"
    });
  }
};