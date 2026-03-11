const db = require("../db");

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body;

  // 1. Validation based on Contract Constraints
  if (!creator_id || !grid_size || !max_players) {
    return res.status(400).json({ error: "missing required fields" });
  }

  // Contract: 5:15 grid_size
  if (grid_size < 5 || grid_size > 15) {
    return res.status(400).json({ error: "invalid grid size" });
  }

  try {
    // 2. Insert into 'games' table (lowercase/underscore matches your schema)
    const result = await db.query(
      "INSERT INTO games(creator_id, grid_size, max_players, status) VALUES($1, $2, $3, 'waiting') RETURNING game_id, grid_size, status, current_turn_index",
      [creator_id, grid_size, max_players]
    );

    const game = result.rows[0];

    // 3. Side Effect: Add creator to 'game_players'
    await db.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [game.game_id, creator_id, 0]
    );

    // 4. Contract Response: Must include game_id, grid_size, status, and turn_index
    res.status(201).json({ 
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index
    });

  } catch (err) {
    console.error(err);
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

    // 5. Determine next turn order
    const countResult = await db.query(
      "SELECT COUNT(*) FROM game_players WHERE game_id=$1",
      [id]
    );

    const turn_order = parseInt(countResult.rows[0].count);

    // 6. Side Effect: Add player to 'game_players'
    await db.query(
      "INSERT INTO game_players(game_id, player_id, turn_order) VALUES($1, $2, $3)",
      [id, player_id, turn_order]
    );

    // 7. Side Effect: Update status to 'active' if max players reached
    if (turn_order + 1 === game.max_players) {
        await db.query("UPDATE games SET status = 'active' WHERE game_id = $1", [id]);
    }

    // Contract Response: {"status": "joined"}
    res.status(200).json({ status: "joined" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getGame = async (req, res) => {
  const { id } = req.params;

  try {
    // 8. Retrieve Game State
    const result = await db.query(
      `SELECT g.game_id, g.grid_size, g.status, g.current_turn_index, 
       (SELECT COUNT(*) FROM game_players WHERE game_id = g.game_id) as active_players
       FROM games g WHERE g.game_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }

    // 9. Contract Response: Must include active_players count
    const game = result.rows[0];
    res.status(200).json({
      game_id: game.game_id,
      grid_size: game.grid_size,
      status: game.status,
      current_turn_index: game.current_turn_index,
      active_players: parseInt(game.active_players)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};