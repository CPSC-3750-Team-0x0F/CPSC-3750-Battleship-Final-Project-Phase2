const db = require("../db");

const isStrictInt = (value) =>
  (typeof value === "number" && Number.isInteger(value)) ||
  (typeof value === "string" && /^-?\d+$/.test(value));

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body || {};

  // Strict numeric validation to prevent type errors / injection-style crashes
  if (
    !isStrictInt(creator_id) ||
    !isStrictInt(grid_size) ||
    !isStrictInt(max_players)
  ) {
    return res.status(400).json({ error: "missing required fields" });
  }

  const creatorId = Number(creator_id);
  const gridSize = Number(grid_size);
  const maxPlayers = Number(max_players);

  if (gridSize < 5 || gridSize > 15) {
    return res.status(400).json({ error: "invalid grid size" });
  }

  const client = typeof db.connect === "function" ? await db.connect() : db;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO games(creator_id, grid_size, max_players, status, current_turn_index)
       VALUES($1, $2, $3, 'waiting', 0)
       RETURNING game_id, grid_size, status, current_turn_index`,
      [creatorId, gridSize, maxPlayers]
    );

    const game = result.rows[0];

    await client.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [game.game_id, creatorId, 0]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error("Create Game Error:", err.message);
    return res.status(500).json({ error: "database error" });
  } finally {
    if (client !== db && typeof client.release === "function") {
      client.release();
    }
  }
};

exports.joinGame = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body || {};

  // Strict numeric validation to prevent type errors / injection-style crashes
  if (!isStrictInt(id) || !isStrictInt(player_id)) {
    return res.status(400).json({ error: "player_id required" });
  }

  const gameId = Number(id);
  const playerId = Number(player_id);

  const client = typeof db.connect === "function" ? await db.connect() : db;

  try {
    await client.query("BEGIN");

    // Identity Enforcement: Verify the player exists globally
    const playerExists = await client.query(
      "SELECT 1 FROM players WHERE player_id = $1",
      [playerId]
    );
    if (playerExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "player does not exist" });
    }

    // Concurrency: Lock the game record
    const gameRes = await client.query(
      "SELECT * FROM games WHERE game_id = $1 FOR UPDATE",
      [gameId]
    );
    if (gameRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "game not found" });
    }
    const game = gameRes.rows[0];

    const countRes = await client.query(
      "SELECT COUNT(*) FROM game_players WHERE game_id = $1",
      [gameId]
    );
    const currentCount = parseInt(countRes.rows[0].count, 10);

    if (currentCount >= game.max_players) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "game full" });
    }

    const alreadyJoined = await client.query(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, playerId]
    );
    if (alreadyJoined.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "player already joined" });
    }

    await client.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [gameId, playerId, currentCount]
    );

    if (currentCount + 1 === game.max_players) {
      await client.query(
        "UPDATE games SET status = 'active' WHERE game_id = $1",
        [gameId]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({ status: "joined", turn_order: currentCount });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error("Join Game Error:", err.message);
    return res.status(500).json({ error: "database error" });
  } finally {
    if (client !== db && typeof client.release === "function") {
      client.release();
    }
  }
};

exports.getGame = async (req, res) => {
  const { id } = req.params;

  if (!isStrictInt(id)) {
    return res.status(400).json({ error: "invalid game id" });
  }

  const gameId = Number(id);

  try {
    const result = await db.query(
      `SELECT g.game_id, g.grid_size, g.status, g.current_turn_index,
       (SELECT COUNT(*) FROM game_players WHERE game_id = g.game_id) as active_players
       FROM games g WHERE g.game_id = $1`,
      [gameId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Get Game Error:", err.message);
    return res.status(500).json({ error: "database error" });
  }
};