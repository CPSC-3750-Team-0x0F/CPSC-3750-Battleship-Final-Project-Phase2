const db = require("../db");

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body;

  const result = await db.query(
    "INSERT INTO games(creator_id, grid_size, max_players, status) VALUES($1,$2,$3,'waiting') RETURNING game_id",
    [creator_id, grid_size, max_players]
  );

  res.json(result.rows[0]);
};

exports.joinGame = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;

  await db.query(
    "INSERT INTO game_players(game_id, player_id) VALUES($1,$2)",
    [id, player_id]
  );

  res.json({ status: "joined" });
};

exports.getGame = async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    "SELECT * FROM games WHERE game_id=$1",
    [id]
  );

  res.json(result.rows[0]);
};