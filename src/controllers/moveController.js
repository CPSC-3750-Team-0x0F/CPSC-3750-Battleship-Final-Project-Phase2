const db = require("../db");

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