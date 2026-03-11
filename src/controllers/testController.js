const db = require("../db");

// POST /api/test/games/{id}/ships
// Deterministic Ship Placement (used for grading during testing)
exports.placeShips = async (req, res) => {
  const { id } = req.params; // Using 'id' to match standard route params
  const { player_id, ships } = req.body; // Changed from playerId to player_id

  if (!player_id || !ships) {
    return res.status(400).json({ error: "Missing player_id or ships" });
  }

  try {
    // Contract Side Effect: Sets ship coordinates deterministically
    // Overrides normal ship placement validation
    for (const ship of ships) {
      // The contract sends ships as { "row": 0, "col": 0 }, not a nested coordinates array
      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [id, player_id, ship.row, ship.col]
      );
    }

    // Contract Response: {"status": "ships_set"}
    return res.status(200).json({ status: "ships_set" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};

// GET /api/test/games/{id}/board/{player_id}
// Reveal Board State (used for grading during testing)
exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params; // Both are path parameters in the contract

  try {
    const ships = await db.query(
      "SELECT row, col FROM ships WHERE game_id=$1 AND player_id=$2",
      [id, player_id]
    );

    // Using row/col to match schema.sql and API Move History structure
    const moves = await db.query(
      "SELECT row, col, result FROM moves WHERE game_id=$1 AND player_id=$2",
      [id, player_id]
    );

    // Contract Response: { "ships": [...], "moves": [...] }
    return res.json({
      ships: ships.rows,
      moves: moves.rows
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};

// POST /api/test/games/{id}/reset
// Restart Game (Used for grading during testing)
exports.resetGame = async (req, res) => {
  const { id } = req.params;

  try {
    // Contract Side Effect: Clears all ships and moves from current game
    await db.query("DELETE FROM ships WHERE game_id=$1", [id]);
    await db.query("DELETE FROM moves WHERE game_id=$1", [id]);

    // Contract Side Effect: Resets game status to 'waiting'
    await db.query(
      "UPDATE games SET status='waiting', current_turn_index=0 WHERE game_id=$1",
      [id]
    );

    // Contract Response: {"status": "game_restarted"}
    return res.json({ status: "game_restarted" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};

// Note: setTurn is not in your current API Contract but can be kept for custom debugging.
exports.setTurn = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;

  try {
    const player = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id=$1 AND player_id=$2",
      [id, player_id]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "Player not found in game" });
    }

    await db.query(
      "UPDATE games SET current_turn_index=$1 WHERE game_id=$2",
      [player.rows[0].turn_order, id]
    );

    return res.json({ status: "turn set" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};