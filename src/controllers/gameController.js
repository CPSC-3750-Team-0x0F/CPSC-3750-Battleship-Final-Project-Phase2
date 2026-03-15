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
    // Start a transaction to ensure both game and game_players are created
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
    console.error("Create Game Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};

exports.joinGame = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;

  if (!player_id) {
    return res.status(400).json({ error: "player_id required" });
  }

  try {
    const gameResult = await db.query(
      "SELECT * FROM games WHERE game_id=$1",
      [id]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }

    const game = gameResult.rows[0];

    const countResult = await db.query(
      "SELECT COUNT(*) FROM game_players WHERE game_id=$1",
      [id]
    );

    const turn_order = parseInt(countResult.rows[0].count);

    await db.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [id, player_id, turn_order]
    );

    if (turn_order + 1 === game.max_players) {
        await db.query("UPDATE games SET status = 'active' WHERE game_id = $1", [id]);
    }

    res.status(200).json({ status: "joined" });

  } catch (err) {
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

    const game = result.rows[0];
    res.status(200).json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index,
      active_players: parseInt(game.active_players)
    });

  } catch (err) {
    console.error("Get Game Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};