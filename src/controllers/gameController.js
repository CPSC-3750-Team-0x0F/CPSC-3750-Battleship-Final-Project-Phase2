const db = require("../db");

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body;

  if (!creator_id || !grid_size || !max_players) {
    return res.status(400).json({ error: "missing required fields" });
  }

  if (grid_size < 5 || grid_size > 15) {
    return res.status(400).json({ error: "invalid grid size" });
  }

  try {
    await db.query('BEGIN');

    const result = await db.query(
      "INSERT INTO games(creator_id, grid_size, max_players, status, current_turn_index) VALUES($1, $2, $3, 'waiting', 0) RETURNING game_id, grid_size, status, current_turn_index",
      [creator_id, grid_size, max_players]
    );

    const game = result.rows[0];

    await db.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [game.game_id, creator_id, 0]
    );

    await db.query('COMMIT');

    res.status(201).json({ 
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index
    });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.joinGame = async (req, res) => {
  const { id } = req.params; 
  const { player_id } = req.body;

  if (!player_id) return res.status(400).json({ error: "player_id required" });

  try {
    // RESTORED: Verify the player actually exists in the system
    const playerExists = await db.query(
      "SELECT 1 FROM players WHERE player_id = $1", 
      [player_id]
    );
    if (playerExists.rows.length === 0) {
      return res.status(404).json({ error: "player does not exist" });
    }

    await db.query('BEGIN');

    // Lock the game record to prevent race conditions during join
    const gameRes = await db.query("SELECT * FROM games WHERE game_id = $1 FOR UPDATE", [id]);
    if (gameRes.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "game not found" });
    }
    const game = gameRes.rows[0];

    // Check current player count
    const countRes = await db.query("SELECT COUNT(*) FROM game_players WHERE game_id = $1", [id]);
    const currentCount = parseInt(countRes.rows[0].count);

    if (currentCount >= game.max_players) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "game full" });
    }

    // Check if the player has already joined
    const alreadyJoined = await db.query("SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (alreadyJoined.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "player already joined" });
    }

    // Add player to the game
    await db.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [id, player_id, currentCount]
    );

    // If the game is now full, set it to active
    if (currentCount + 1 === game.max_players) {
      await db.query("UPDATE games SET status = 'active' WHERE game_id = $1", [id]);
    }

    await db.query('COMMIT');

    res.status(200).json({ 
      status: "joined",
      turn_order: currentCount 
    });

  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.joinGame = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;

  if (!player_id) return res.status(400).json({ error: "player_id required" });

  try {
    await db.query('BEGIN');

    // 1. Lock the game record to prevent race conditions during join
    const gameRes = await db.query("SELECT * FROM games WHERE game_id = $1 FOR UPDATE", [id]);
    if (gameRes.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "game not found" });
    }
    const game = gameRes.rows[0];

    // 2. Check current player count
    const countRes = await db.query("SELECT COUNT(*) FROM game_players WHERE game_id = $1", [id]);
    const currentCount = parseInt(countRes.rows[0].count);

    if (currentCount >= game.max_players) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "game full" }); // Meets requirement for 400 or 409
    }

    // 3. Check if the player has already joined
    const alreadyJoined = await db.query("SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (alreadyJoined.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "player already joined" });
    }

    // 4. Add player to the game
    await db.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [id, player_id, currentCount]
    );

    // 5. If the game is now full, set it to active
    if (currentCount + 1 === game.max_players) {
      await db.query("UPDATE games SET status = 'active' WHERE game_id = $1", [id]);
    }

    await db.query('COMMIT');

    res.status(200).json({ 
      status: "joined",
      turn_order: currentCount 
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error("Join Game Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};

exports.getGame = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      `SELECT g.game_id, g.grid_size, g.status, g.current_turn_index, 
       (SELECT COUNT(*) FROM game_players WHERE game_id = g.game_id) as active_players
       FROM games g WHERE g.game_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};