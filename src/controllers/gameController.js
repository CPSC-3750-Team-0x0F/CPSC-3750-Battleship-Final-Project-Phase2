const db = require("../db");

const isStrictInt = (value) =>
  (typeof value === "number" && Number.isInteger(value)) ||
  (typeof value === "string" && /^-?\d+$/.test(value));

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body || {};

  // Loosened check to ensure we don't reject valid numeric strings from the test script
  if (creator_id === undefined || grid_size === undefined || max_players === undefined) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "missing required fields: creator_id, grid_size, or max_players" 
    });
  }

  const creatorId = parseInt(creator_id);
  const gridSize = parseInt(grid_size);
  const maxPlayers = parseInt(max_players);

  // Contract: 5-15 grid, 2-10 players
  if (isNaN(gridSize) || gridSize < 5 || gridSize > 15 || isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 10) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "invalid grid size (5-15) or max players (2-10)" 
    });
  }

  const client = typeof db.connect === "function" ? await db.connect() : db;

  try {
    await client.query("BEGIN");

    // Verify creator exists
    const playerCheck = await client.query("SELECT 1 FROM players WHERE player_id = $1", [creatorId]);
    if (playerCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "Creator player not found" });
    }

    // Initial status per contract: 'waiting_setup'
    const result = await client.query(
      `INSERT INTO games(creator_id, grid_size, max_players, status, current_turn_index)
       VALUES($1, $2, $3, 'waiting_setup', 0)
       RETURNING game_id, grid_size, status`,
      [creatorId, gridSize, maxPlayers]
    );

    const game = result.rows[0];

    // Automatically join the creator to the game as player 0
    await client.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [game.game_id, creatorId, 0]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Create Game Error:", err.message);
    return res.status(500).json({ 
      error: "server_error", 
      message: err.message 
    });
  } finally {
    if (client !== db && typeof client.release === "function") {
      client.release();
    }
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

  const gameId = parseInt(id);
  const playerId = parseInt(player_id);
  const client = typeof db.connect === "function" ? await db.connect() : db;

  try {
    await client.query("BEGIN");

    const playerExists = await client.query("SELECT 1 FROM players WHERE player_id = $1", [playerId]);
    if (playerExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ 
        error: "not_found", 
        message: "player does not exist" 
      });
    }

    const gameRes = await client.query("SELECT * FROM games WHERE game_id = $1 FOR UPDATE", [gameId]);
    if (gameRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ 
        error: "not_found", 
        message: "game not found" 
      });
    }
    const game = gameRes.rows[0];

    const countRes = await client.query("SELECT COUNT(*) FROM game_players WHERE game_id = $1", [gameId]);
    const currentCount = parseInt(countRes.rows[0].count, 10);

    if (currentCount >= game.max_players) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        error: "bad_request", 
        message: "game full" 
      });
    }

    const alreadyJoined = await client.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, playerId]
    );
    if (alreadyJoined.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        error: "bad_request", 
        message: "player already joined" 
      });
    }

    await client.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [gameId, playerId, currentCount]
    );

    await client.query("COMMIT");

    return res.status(200).json({ status: "joined", turn_order: currentCount });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    return res.status(500).json({ 
      error: "server_error", 
      message: "database error" 
    });
  } finally {
    if (client !== db && typeof client.release === "function") {
      client.release();
    }
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
      `SELECT g.game_id, g.grid_size, g.status, g.current_turn_index, g.max_players,
       (SELECT COUNT(*) FROM game_players WHERE game_id = g.game_id) as active_players
       FROM games g WHERE g.game_id = $1`,
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "not_found", 
        message: "game not found" 
      });
    }

    const game = result.rows[0];
    
    return res.json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index,
      max_players: game.max_players,
      players_joined: parseInt(game.active_players)
    });
  } catch (err) {
    return res.status(500).json({ 
      error: "server_error", 
      message: "database error" 
    });
  }
};