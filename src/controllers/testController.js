const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;
  try {
    await db.query('BEGIN');
    await db.query("DELETE FROM ships WHERE game_id=$1 AND player_id=$2", [id, player_id]);
    for (const ship of ships) {
      await db.query("INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)", [id, player_id, ship.row, ship.col]);
    }
    await db.query('COMMIT');
    res.status(200).json({ status: "ships_set" });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.revealBoard = async (req, res) => {
  const { id, player_id } = req.params;
  try {
    const ships = await db.query("SELECT row, col FROM ships WHERE game_id=$1 AND player_id=$2", [id, player_id]);
    const moves = await db.query("SELECT row, col, result FROM moves WHERE game_id=$1 AND player_id=$2", [id, player_id]);
    res.status(200).json({ ships: ships.rows, moves: moves.rows });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};

exports.resetGame = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('BEGIN');
    await db.query("DELETE FROM ships WHERE game_id=$1", [id]);
    await db.query("DELETE FROM moves WHERE game_id=$1", [id]);
    await db.query("UPDATE games SET status='waiting', current_turn_index=0 WHERE game_id=$1", [id]);
    await db.query('COMMIT');
    res.status(200).json({ status: "game_restarted" });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.setTurn = async (req, res) => {
  const { id } = req.params;
  const { player_id } = req.body;
  try {
    const player = await db.query("SELECT turn_order FROM game_players WHERE game_id=$1 AND player_id=$2", [id, player_id]);
    if (player.rows.length === 0) return res.status(404).json({ error: "Player not found" });
    await db.query("UPDATE games SET current_turn_index=$1 WHERE game_id=$2", [player.rows[0].turn_order, id]);
    res.json({ status: "turn set", current_turn_index: player.rows[0].turn_order });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};