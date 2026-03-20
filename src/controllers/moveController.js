const db = require("../db");

/**
 * Requirement: Ship Placement Validation (Checkpoint A & B)
 */
exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  if (!player_id || !ships || ships.length !== 3) {
    return res.status(400).json({ error: "exactly 3 ships required" });
  }

  try {
    const gameResult = await db.query("SELECT grid_size FROM games WHERE game_id = $1", [id]);
    if (gameResult.rows.length === 0) return res.status(404).json({ error: "game not found" });
    const gridSize = gameResult.rows[0].grid_size;

    await db.query('BEGIN');
    const seenInRequest = new Set();

    for (const ship of ships) {
      if (ship.row < 0 || ship.row >= gridSize || ship.col < 0 || ship.col >= gridSize) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "ship coordinates out of bounds" });
      }

      const coordKey = `${ship.row},${ship.col}`;
      if (seenInRequest.has(coordKey)) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "overlapping ship coordinates in request" });
      }
      seenInRequest.add(coordKey);

      const overlapCheck = await db.query(
        "SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2 AND row = $3 AND col = $4",
        [id, player_id, ship.row, ship.col]
      );

      if (overlapCheck.rows.length > 0) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "overlapping ship coordinates" });
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
    res.status(500).json({ error: "database error" });
  }
};

/**
 * Requirement: Fire Gating & Logic (Checkpoint B)
 */
exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  try {
    // 1. Fire Gating: Count total ships in game against required total
    const gameSetup = await db.query(
      "SELECT max_players, (SELECT COUNT(*) FROM ships WHERE game_id = $1) as ships_placed FROM games WHERE game_id = $1",
      [id]
    );

    if (gameSetup.rows.length === 0) return res.status(404).json({ error: "game not found" });

    const { max_players, ships_placed } = gameSetup.rows[0];
    if (parseInt(ships_placed) < (max_players * 3)) {
      return res.status(400).json({ error: "firing not allowed until all ships are placed" });
    }

    // 2. Identity & Turn Validation
    const gameQuery = await db.query(
      `SELECT g.*, gp.turn_order 
       FROM games g 
       JOIN game_players gp ON g.game_id = gp.game_id
       WHERE g.game_id = $1 AND gp.player_id = $2`,
      [id, player_id]
    );

    if (gameQuery.rows.length === 0) return res.status(403).json({ error: "player not in this game" });

    const game = gameQuery.rows[0];
    if (game.status !== 'active' || parseInt(game.current_turn_index) !== parseInt(game.turn_order)) {
      return res.status(400).json({ error: "not your turn or game not active" });
    }

    // 3. Process Shot
    await db.query('BEGIN');
    const targetShip = await db.query(
      "SELECT * FROM ships WHERE game_id=$1 AND player_id != $2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );

    const result = targetShip.rows.length > 0 ? "hit" : "miss";
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // 4. Update Turn
    const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;
    await db.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, id]);

    // 5. Win Condition
    let gameStatus = 'active';
    if (result === "hit") {
      const remainingShips = await db.query(
        `SELECT COUNT(*) FROM ships s
         WHERE s.game_id = $1 AND s.player_id != $2
         AND NOT EXISTS (
            SELECT 1 FROM moves m 
            WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit'
         )`, [id, player_id]
      );

      if (parseInt(remainingShips.rows[0].count) === 0) {
        gameStatus = 'completed';
        await db.query("UPDATE games SET status = 'completed' WHERE game_id = $1", [id]);
      }
    }

    await db.query('COMMIT');
    res.json({ result, next_player_id: null, game_status: gameStatus });

  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT * FROM moves WHERE game_id = $1 ORDER BY move_id ASC", [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};