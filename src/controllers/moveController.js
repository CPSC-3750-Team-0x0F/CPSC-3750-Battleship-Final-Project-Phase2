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
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  try {
    // Basic hit detection: check if a ship exists at these coordinates for the OTHER player
    const targetShip = await db.query(
      "SELECT * FROM ships WHERE game_id=$1 AND player_id != $2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );

    const result = targetShip.rows.length > 0 ? "hit" : "miss";

    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // Get current game state to return status
    const game = await db.query("SELECT status FROM games WHERE game_id=$1", [id]);

    res.json({
      result: result,
      next_player_id: null, // Logic for turn rotation goes here
      game_status: game.rows[0].status,
    });
  } catch (err) {
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