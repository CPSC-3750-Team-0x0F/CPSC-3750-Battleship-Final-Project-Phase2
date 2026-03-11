const db = require("../db");

// POST /test/games/{gameId}/ships
exports.placeShips = async (req, res) => {
  const { gameId } = req.params;
  const { playerId, ships } = req.body;

  if (!playerId || !ships) {
    return res.status(400).json({ error: "Missing playerId or ships" });
  }

  try {

    // check game exists
    const game = await db.query(
      "SELECT grid_size, status FROM games WHERE game_id=$1",
      [gameId]
    );

    if (game.rows.length === 0) {
      return res.status(404).json({ error: "Game not found" });
    }

    const gridSize = game.rows[0].grid_size;

    // only allow placement before game starts
    if (game.rows[0].status !== "waiting") {
      return res.status(400).json({ error: "Game already started" });
    }

    for (const ship of ships) {
      for (const coord of ship.coordinates) {

        const row = coord[0];
        const col = coord[1];

        // bounds validation
        if (row < 0 || col < 0 || row >= gridSize || col >= gridSize) {
          return res.status(400).json({ error: "Invalid ship placement" });
        }

        // overlap validation
        const overlap = await db.query(
          "SELECT * FROM ships WHERE game_id=$1 AND row=$2 AND col=$3",
          [gameId, row, col]
        );

        if (overlap.rows.length > 0) {
          return res.status(400).json({ error: "Ship overlap detected" });
        }

        await db.query(
          "INSERT INTO ships(game_id, player_id, row, col) VALUES($1,$2,$3,$4)",
          [gameId, playerId, row, col]
        );
      }
    }

    return res.status(200).json({ status: "ships placed" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};


// GET /test/games/{gameId}/board
exports.revealBoard = async (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.query;

  try {

    const ships = await db.query(
      "SELECT row, col FROM ships WHERE game_id=$1 AND player_id=$2",
      [gameId, playerId]
    );

    const moves = await db.query(
      "SELECT x, y FROM moves WHERE game_id=$1",
      [gameId]
    );

    return res.json({
      ships: ships.rows,
      moves: moves.rows
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};


// POST /test/games/{gameId}/reset
exports.resetGame = async (req, res) => {
  const { gameId } = req.params;

  try {

    await db.query("DELETE FROM ships WHERE game_id=$1", [gameId]);
    await db.query("DELETE FROM moves WHERE game_id=$1", [gameId]);

    await db.query(
      "UPDATE games SET status='waiting' WHERE game_id=$1",
      [gameId]
    );

    return res.json({ status: "reset" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};


// POST /test/games/{gameId}/set-turn
exports.setTurn = async (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body;

  try {

    const player = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id=$1 AND player_id=$2",
      [gameId, playerId]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "Player not found in game" });
    }

    await db.query(
      "UPDATE games SET current_turn_index=$1 WHERE game_id=$2",
      [player.rows[0].turn_order, gameId]
    );

    return res.json({ status: "turn set" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};