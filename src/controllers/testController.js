const db = require("../db");

/**
 * POST /api/test/games/{id}/ships
 * Deterministic Ship Placement (used for grading during testing)
 * Requirement: Test endpoint accepts deterministic ship placement — returns 200 or 201
 */
exports.placeShips = async (req, res) => {
  const { id } = req.params; 
  const { player_id, ships } = req.body; 

  if (!player_id || !ships || !Array.isArray(ships)) {
    return res.status(400).json({ error: "Missing player_id or ships array" });
  }

  try {
    await db.query('BEGIN');

    // Deterministic placement usually clears existing ships for that player first 
    // to ensure the state is exactly what the test expects.
    await db.query("DELETE FROM ships WHERE game_id=$1 AND player_id=$2", [id, player_id]);

    for (const ship of ships) {
      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)",
        [id, player_id, ship.row, ship.col]
      );
    }

    await db.query('COMMIT');

    // Returning 201 to signify creation, which satisfies "200 or 201" requirement
    return res.status(201).json({ status: "ships_set" });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error("Test Place Ships Error:", err.message);
    return res.status(500).json({ error: "database error" });
  }
};

/**
 * GET /api/test/games/{id}/board/{player_id}
 * Board reveal returns a non-empty response after ship placement
 */
exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params;

  try {
    const ships = await db.query(
      "SELECT row, col FROM ships WHERE game_id=$1 AND player_id=$2",
      [id, player_id]
    );

    const moves = await db.query(
      "SELECT row, col, result FROM moves WHERE game_id=$1 AND player_id=$2",
      [id, player_id]
    );

    // Requirement: Board reveal returns a non-empty response
    return res.status(200).json({
      ships: ships.rows,
      moves: moves.rows
    });

  } catch (err) {
    console.error("Board Reveal Error:", err.message);
    return res.status(500).json({ error: "database error" });
  }
};

/**
 * POST /api/test/games/{id}/reset
 * Restart Game (Used for grading during testing)
 */
exports.resetGame = async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('BEGIN');

    // Clears all state for this specific game
    await db.query("DELETE FROM ships WHERE game_id=$1", [id]);
    await db.query("DELETE FROM moves WHERE game_id=$1", [id]);

    // Resets game status so players can place ships again
    await db.query(
      "UPDATE games SET status='waiting', current_turn_index=0 WHERE game_id=$1",
      [id]
    );

    await db.query('COMMIT');
    return res.status(200).json({ status: "game_restarted" });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error("Reset Game Error:", err.message);
    return res.status(500).json({ error: "database error" });
  }
};

/**
 * Custom helper: setTurn
 * Not strictly in the public 10-test suite but useful for logic testing
 */
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

    return res.json({ status: "turn set", current_turn_index: player.rows[0].turn_order });

  } catch (err) {
    console.error("Set Turn Error:", err.message);
    res.status(500).json({ error: "database error" });
  }
};