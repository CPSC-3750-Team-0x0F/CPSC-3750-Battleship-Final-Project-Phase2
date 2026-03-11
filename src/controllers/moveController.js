const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  if (!player_id || !ships) {
    return res.status(400).json({ error: "missing data" });
  }

  try {

    for (const ship of ships) {
      await db.query(
        "INSERT INTO ships(game_id, player_id, row, col) VALUES($1,$2,$3,$4)",
        [id, player_id, ship.row, ship.col]
      );
    }

    res.status(200).json({ status: "ships placed" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  await db.query(
    "INSERT INTO moves(game_id, player_id, x, y) VALUES($1,$2,$3,$4)",
    [id, player_id, row, col]
  );

  res.json({
    result: "miss",
    next_player_id: null,
    game_status: "active",
  });
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    "SELECT * FROM moves WHERE game_id=$1 ORDER BY created_at",
    [id]
  );

  res.json(result.rows);
};