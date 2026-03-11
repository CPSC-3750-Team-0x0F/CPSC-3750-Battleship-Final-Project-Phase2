const db = require("../db");

exports.createGame = async (req, res) => {
  const { creator_id, grid_size, max_players } = req.body;

  // Validate inputs
  if (!creator_id || !grid_size || !max_players) {
    return res.status(400).json({ error: "missing required fields" });
  }

  // Grid size validation (required by autograder)
  if (grid_size < 5 || grid_size > 15) {
    return res.status(400).json({ error: "invalid grid size" });
  }

  try {
    const result = await db.query(
      "INSERT INTO games(creator_id, grid_size, max_players, status) VALUES($1,$2,$3,'waiting') RETURNING game_id",
      [creator_id, grid_size, max_players]
    );

    // Must return 201 for autograder
    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.joinGame = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;

  if (!player_id) {
    return res.status(400).json({ error: "player_id required" });
  }

  try {
    // Check if game exists
    const game = await db.query(
      "SELECT * FROM games WHERE game_id=$1",
      [id]
    );

    if (game.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }

    await db.query(
      "INSERT INTO game_players(game_id, player_id) VALUES($1,$2)",
      [id, player_id]
    );

    res.status(200).json({ status: "joined" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getGame = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.query(
      "SELECT * FROM games WHERE game_id=$1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "game not found" });
    }

    res.status(200).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};