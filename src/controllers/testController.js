const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  if (!player_id || !ships || !Array.isArray(ships)) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "Missing player_id or ships array" 
    });
  }

  try {
    const gameRes = await db.query("SELECT grid_size FROM games WHERE game_id = $1", [id]);
    if (gameRes.rows.length === 0) {
      return res.status(404).json({ 
        error: "not_found", 
        message: "game not found" 
      });
    }
    const gridSize = gameRes.rows[0].grid_size;

    await db.query('BEGIN');
    
    // Test mode allows overwriting ships
    await db.query("DELETE FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    
    for (const ship of ships) {
      // Boundary Validation: Reject if row or col is outside 0 to (gridSize - 1)
      if (ship.row < 0 || ship.row >= gridSize || ship.col < 0 || ship.col >= gridSize) {
        await db.query('ROLLBACK');
        return res.status(400).json({ 
          error: "bad_request", 
          message: "out of bounds" 
        });
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
    res.status(500).json({ 
      error: "server_error", 
      message: "database error" 
    });
  }
};

// controllers/testController.js

exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params; // Ensure these match the route /:id/board/:player_id
  try {
    const ships = await db.query(
      "SELECT row, col FROM ships WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );
    const hits = await db.query(
      "SELECT row, col FROM moves WHERE game_id = $1 AND result = 'hit'",
      [id]
    );
    // Return the board state the test expects
    res.status(200).json({
      ships: ships.rows,
      hits: hits.rows
    });
  } catch (err) {
    res.status(500).json({ error: "server_error" });
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
      SET status = 'waiting_setup',
          current_turn_index = 0,
          winner_id = NULL
      WHERE game_id = $1`,
      [id]
    );

    await db.query('COMMIT');
    // Contract requires { "status": "reset" }
    res.status(200).json({ status: "reset" });
  } catch (err) {
    if (db) await db.query('ROLLBACK');
    res.status(500).json({ 
      error: "server_error", 
      message: "database error" 
    });
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
      return res.status(404).json({ 
        error: "not_found", 
        message: "player not in game" 
      });
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
    res.status(500).json({ 
      error: "server_error", 
      message: "database error" 
    });
  }
};