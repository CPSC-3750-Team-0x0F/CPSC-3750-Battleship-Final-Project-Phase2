const db = require("../db");

/**
 * Requirement: Ship Placement Validation (Checkpoint B)
 * - Validates exactly 3 ships.
 * - Checks for out-of-bounds (assumes 0 to grid_size-1).
 */
exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  // 1. Validate ship count
  if (!player_id || !ships || ships.length !== 3) {
    return res.status(400).json({ error: "exactly 3 ships required" });
  }

  try {
    // Get game info for boundary check
    const gameResult = await db.query("SELECT grid_size FROM games WHERE game_id = $1", [id]);
    if (gameResult.rows.length === 0) return res.status(404).json({ error: "game not found" });
    const gridSize = gameResult.rows[0].grid_size;

    await db.query('BEGIN');

    for (const ship of ships) {
      // 2. Out-of-bounds validation
      if (ship.row < 0 || ship.row >= gridSize || ship.col < 0 || ship.col >= gridSize) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "ship coordinates out of bounds" });
      }

      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [id, player_id, ship.row, ship.col]
      );
    }

    await db.query('COMMIT');
    res.status(200).json({ status: "ships_placed" });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error("Place Ships Error:", err.message);
    // Overlapping coordinates will trigger a unique constraint error if your DB schema has one
    if (err.code === '23505') {
        return res.status(400).json({ error: "overlapping ship coordinates" });
    }
    res.status(500).json({ error: "database error" });
  }
};

/**
 * Requirement: Fire Gating & Win Condition (Checkpoint B & Final)
 */
exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  try {
    await db.query('BEGIN');

    // 1. Fire Gating: Ensure both players have placed 3 ships
    const shipsReady = await db.query(
      "SELECT player_id, COUNT(*) FROM ships WHERE game_id = $1 GROUP BY player_id",
      [id]
    );

    // If less than 2 players have ships, or any player has != 3 ships, block firing
    if (shipsReady.rows.length < 2 || shipsReady.rows.some(r => parseInt(r.count) !== 3)) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "All players must place 3 ships before firing" });
    }

    // 2. Turn & Status Validation
    const gameQuery = await db.query(
      `SELECT g.*, gp.turn_order 
       FROM games g 
       JOIN game_players gp ON g.game_id = gp.game_id 
       WHERE g.game_id = $1 AND gp.player_id = $2`,
      [id, player_id]
    );

    if (gameQuery.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "game or player not found" });
    }

    const game = gameQuery.rows[0];

    if (game.status === 'completed') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "game is already finished" });
    }

    if (game.current_turn_index !== game.turn_order) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "Not your turn" });
    }

    // 3. Duplicate Shot Check
    const dupCheck = await db.query(
      "SELECT 1 FROM moves WHERE game_id=$1 AND player_id=$2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );
    if (dupCheck.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "coordinates already fired upon" });
    }

    // 4. Hit Detection
    const targetShip = await db.query(
      "SELECT * FROM ships WHERE game_id=$1 AND player_id != $2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );

    const result = targetShip.rows.length > 0 ? "hit" : "miss";

    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // 5. Update Turn (toggle between 0 and 1 for 2-player games)
    const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;
    await db.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, id]);

    // 6. Win Condition Check
    let gameStatus = 'active';
    let winnerId = null;

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
        winnerId = player_id;
        await db.query("UPDATE games SET status = 'completed' WHERE game_id = $1", [id]);
      }
    }

    await db.query('COMMIT');

    res.json({
      result: result,
      next_player_id: null, // UI can derive this if needed
      game_status: gameStatus,
      winner_id: winnerId
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
      "SELECT player_id, row, col, result, move_timestamp FROM moves WHERE game_id=$1 ORDER BY move_timestamp ASC",
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};