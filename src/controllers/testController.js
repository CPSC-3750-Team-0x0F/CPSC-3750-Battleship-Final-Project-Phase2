const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;
  if (!player_id || !ships || !Array.isArray(ships)) {
    return res.status(400).json({ error: "Missing player_id or ships array" });
  }

  try {
    // Fetch grid_size to validate that ships are placed within bounds
    const gameRes = await db.query("SELECT grid_size FROM games WHERE game_id = $1", [id]);
    if (gameRes.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }
    const gridSize = gameRes.rows[0].grid_size;

    await db.query('BEGIN');
    
    // Test mode allows overwriting ships
    await db.query("DELETE FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    
    for (const ship of ships) {
      // Boundary Validation: Reject if row or col is outside 0 to (gridSize - 1)
      if (ship.row < 0 || ship.row >= gridSize || ship.col < 0 || ship.col >= gridSize) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "out of bounds" });
      }

      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [id, player_id, ship.row, ship.col]
      );
    }
    
    await db.query('COMMIT');
    res.status(200).json({ status: "ships_set" });
  } catch (err) {
    if (db) await db.query('ROLLBACK');
    console.error("Place Ships Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};

exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params;
  try {
    const ships = await db.query("SELECT row, col FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    const moves = await db.query("SELECT row, col, result FROM moves WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    res.status(200).json({ 
      ships: ships.rows, 
      moves: moves.rows 
    });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};

exports.resetGame = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('BEGIN');

    await db.query("DELETE FROM ships WHERE game_id = $1", [id]);
    await db.query("DELETE FROM moves WHERE game_id = $1", [id]);

    await db.query(
      `UPDATE games 
      SET status = 'waiting',
          current_turn_index = 0,
          winner_id = NULL
      WHERE game_id = $1`,
      [id]
    );

    await db.query('COMMIT');
    res.status(200).json({ status: "success", message: "game reset" });
  } catch (err) {
    if (db) await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.setTurn = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;
  try {
    const player = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "player not in game" });
    }

    await db.query(
      "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
      [player.rows[0].turn_order, id]
    );

    res.status(200).json({ 
      status: "turn_set", 
      current_turn_index: player.rows[0].turn_order 
    });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};