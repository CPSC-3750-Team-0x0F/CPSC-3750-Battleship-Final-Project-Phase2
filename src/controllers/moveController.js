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
  const { id } = req.params; // Game ID
  const { player_id, row, col } = req.body;

  try {
    // 1. Identity & Turn Validation: Get game state and the player's turn order in one query
    const gameQuery = await db.query(
      `SELECT g.*, gp.turn_order 
       FROM games g 
       JOIN game_players gp ON g.game_id = gp.game_id 
       WHERE g.game_id = $1 AND gp.player_id = $2`,
      [id, player_id]
    );

    // Reject if player is not part of this specific game [Checkpoint B: Identity]
    if (gameQuery.rows.length === 0) {
      return res.status(403).json({ error: "Player not in this game" });
    }

    const game = gameQuery.rows[0];

    // 2. Lifecycle Check: Only allow moves if the game is active [Checkpoint B: Lifecycle]
    if (game.status !== 'active') {
      return res.status(400).json({ error: "Game is not active" });
    }

    // 3. Turn Enforcement: Compare game's current index with player's assigned order [Checkpoint B: Turn Enforcement]
    if (game.current_turn_index !== game.turn_order) {
      return res.status(400).json({ error: "Not your turn" });
    }

    // 4. Boundary Validation: Check against the specific game's grid size [Checkpoint B: Out-of-bounds]
    if (row < 0 || row >= game.grid_size || col < 0 || col >= game.grid_size) {
      return res.status(400).json({ error: "Move out of bounds" });
    }

    // 5. Duplicate Move Check: Prevent firing at the same spot twice [Checkpoint B: Duplicate coordinates]
    const duplicateMove = await db.query(
      "SELECT move_id FROM moves WHERE game_id=$1 AND player_id=$2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );
    if (duplicateMove.rows.length > 0) {
      return res.status(400).json({ error: "Coordinates already targeted" });
    }

    // 6. Hit Detection: Check if an opponent's ship exists at these coordinates
    const targetShip = await db.query(
      "SELECT ship_id FROM ships WHERE game_id=$1 AND player_id != $2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );

    const result = targetShip.rows.length > 0 ? "hit" : "miss";

    // Start Transaction for Atomic Updates
    await db.query('BEGIN');

    // 7. Move Logging: Record the shot with result [Checkpoint B: Move logging]
    // Note: move_timestamp is handled by the database DEFAULT NOW()
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // 8. Turn Rotation: Increment index (wrapping around via modulo)
    const nextTurn = (game.current_turn_index + 1) % game.max_players;
    await db.query(
      "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
      [nextTurn, id]
    );

    let gameStatus = game.status;

    // 9. Completion Logic: If it's a hit, check if the opponent has any ships left [Checkpoint B: Completion logic]
    if (result === "hit") {
      const remainingShips = await db.query(
        `SELECT COUNT(*) FROM ships s
         WHERE s.game_id = $1 AND s.player_id != $2
         AND NOT EXISTS (
            SELECT 1 FROM moves m 
            WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit'
         )`,
        [id, player_id]
      );

      if (parseInt(remainingShips.rows[0].count) === 0) {
        gameStatus = 'completed';
        await db.query("UPDATE games SET status = 'completed' WHERE game_id = $1", [id]);
      }
    }

    await db.query('COMMIT');

    res.json({
      result: result,
      next_player_id: null, // You can query for the next player's UUID if your UI needs it
      game_status: gameStatus
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error("Fire Shot Error:", err.message);
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