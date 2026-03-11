const db = require("../db");

exports.placeShips = async (req, res) => {
  const { gameId } = req.params;
  const { playerId, ships } = req.body;

  if (!playerId || !ships) {
    return res.status(400).json({ error: "missing data" });
  }

  try {

    for (const ship of ships) {
      for (const coord of ship.coordinates) {

        const row = coord[0];
        const col = coord[1];

        await db.query(
          "INSERT INTO ships(game_id, player_id, row, col) VALUES($1,$2,$3,$4)",
          [gameId, playerId, row, col]
        );

      }
    }

    res.status(200).json({ status: "ships placed" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

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

    res.json({
      ships: ships.rows,
      moves: moves.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.resetGame = async (req, res) => {
  const { gameId } = req.params;

  try {

    await db.query("DELETE FROM ships WHERE game_id=$1", [gameId]);
    await db.query("DELETE FROM moves WHERE game_id=$1", [gameId]);

    await db.query(
      "UPDATE games SET status='waiting' WHERE game_id=$1",
      [gameId]
    );

    res.json({ status: "reset" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.setTurn = async (req, res) => {
  const { gameId } = req.params;
  const { playerId } = req.body;

  try {

    const player = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id=$1 AND player_id=$2",
      [gameId, playerId]
    );

    if (player.rows.length === 0) {
      return res.status(404).json({ error: "player not found in game" });
    }

    await db.query(
      "UPDATE games SET current_turn_index=$1 WHERE game_id=$2",
      [player.rows[0].turn_order, gameId]
    );

    res.json({ status: "turn set" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};