const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  if (!player_id || !ships || ships.length !== 3) {
    return res.status(400).json({ error: "exactly 3 ships required" });
  }

  try {
    for (const ship of ships) {
      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [id, player_id, ship.row, ship.col]
      );
    }

    res.status(200).json({ status: "ships_placed" });

  } catch (err) {
    console.error("Place Ships Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params; // game_id
  const { player_id, row, col } = req.body;

  try {
    // 1. Get Game and Player Info
    const gameQuery = await db.query(
      `SELECT g.*, gp.turn_order 
       FROM games g 
       JOIN game_players gp ON g.game_id = gp.game_id 
       WHERE g.game_id = $1 AND gp.player_id = $2`,
      [id, player_id]
    );

    if (gameQuery.rows.length === 0) {
      return res.status(403).json({ error: "Player not in this game" });
    }

    const game = gameQuery.rows[0];

    // 2. Check Game Status
    if (game.status !== 'active') {
      return res.status(400).json({ error: "Game is not active" });
    }

    // 3. Turn Enforcement
    if (game.current_turn_index !== game.turn_order) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // 4. Out-of-Bounds Check
    if (row < 0 || row >= game.grid_size || col < 0 || col >= game.grid_size) {
      return res.status(400).json({ error: "Move out of bounds" });
    }

    // 5. Duplicate Move Check
    const duplicateMove = await db.query(
      "SELECT move_id FROM moves WHERE game_id=$1 AND player_id=$2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );
    if (duplicateMove.rows.length > 0) {
      return res.status(400).json({ error: "Coordinates already targeted" });
    }

    // 6. Hit Detection
    const targetShip = await db.query(
      "SELECT ship_id FROM ships WHERE game_id=$1 AND player_id != $2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );

    const result = targetShip.rows.length > 0 ? "hit" : "miss";

    // 7. Atomic Update: Log Move and Rotate Turn
    await db.query('BEGIN');
    
    // Log move (timestamp is handled by DEFAULT NOW() in SQL)
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // Increment turn (modulo max_players)
    const nextTurn = (game.current_turn_index + 1) % game.max_players;
    await db.query(
      "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
      [nextTurn, id]
    );

    await db.query('COMMIT');

    res.json({
      result: result,
      next_turn_index: nextTurn,
      game_status: game.status
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT player_id, row, col, result, move_timestamp as timestamp FROM moves WHERE game_id=$1 ORDER BY move_timestamp ASC",
      [id]
    );

    res.json({ moves: result.rows });
  } catch (err) {
    console.error("Get Moves Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};