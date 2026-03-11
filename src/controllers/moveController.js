const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  // Contract Constraints: Exactly 3 single-cell ships
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

    // Contract Response: {"status": "ships_placed"}
    res.status(200).json({ status: "ships_placed" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  try {
    // 1. Record the shot in the moves table
    // Note: Used row/col to match your schema.sql
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, 'miss'] // 'miss' is a placeholder until hit logic is added
    );

    // 2. Contract Response: { result, next_player_id, game_status }
    res.json({
      result: "miss",
      next_player_id: null, // Logic for turn rotation goes here
      game_status: "active",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;

  try {
    // Contract expects timestamp, so we select move_timestamp
    const result = await db.query(
      "SELECT player_id, row, col, result, move_timestamp as timestamp FROM moves WHERE game_id=$1 ORDER BY move_timestamp ASC",
      [id]
    );

    // Contract Response: {"moves": [...]}
    res.json({ moves: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};