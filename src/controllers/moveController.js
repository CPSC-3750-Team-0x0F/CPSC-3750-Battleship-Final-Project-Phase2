const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  if (!player_id || !ships || ships.length !== 3) {
    return res.status(400).json({ error: "exactly 3 ships required" });
  }

  try {
    const gameResult = await db.query("SELECT grid_size FROM games WHERE game_id = $1", [id]);
    if (gameResult.rows.length === 0) return res.status(404).json({ error: "game not found" });
    const gridSize = gameResult.rows[0].grid_size;

    await db.query('BEGIN');
    const existing = await db.query("SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (existing.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "ships already placed" });
    }

    const seen = new Set();
    for (const ship of ships) {
      if (ship.row < 0 || ship.row >= gridSize || ship.col < 0 || ship.col >= gridSize) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "out of bounds" });
      }
      const pos = `${ship.row},${ship.col}`;
      if (seen.has(pos)) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "duplicate ship positions" });
      }
      seen.add(pos);
      await db.query("INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)", [id, player_id, ship.row, ship.col]);
    }
    await db.query('COMMIT');
    res.status(200).json({ status: "ships_set" });
  } catch (err) {
    if (db) await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  try {
    await db.query('BEGIN');

    // CONCURRENCY FIX: Lock the game row so two people can't fire at the exact same millisecond
    const gameRes = await db.query("SELECT * FROM games WHERE game_id = $1 FOR UPDATE", [id]);
    if (gameRes.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "game not found" });
    }
    const game = gameRes.rows[0];

    if (game.status !== 'active') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "game is not active" });
    }

    // READY CHECK: Ensure all players placed ships (3 ships * max_players)
    const shipCountRes = await db.query("SELECT COUNT(*) FROM ships WHERE game_id = $1", [id]);
    if (parseInt(shipCountRes.rows[0].count) < (game.max_players * 3)) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "all players must place ships before firing" });
    }

    // TURN CHECK
    const turnRes = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );
    if (turnRes.rows.length === 0 || turnRes.rows[0].turn_order !== game.current_turn_index) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "not your turn" });
    }

    // HIT OR MISS
    const shipRes = await db.query(
      "SELECT 1 FROM ships WHERE game_id = $1 AND player_id != $2 AND row = $3 AND col = $4",
      [id, player_id, row, col]
    );
    const result = shipRes.rows.length > 0 ? 'hit' : 'miss';

    // INSERT MOVE
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // UPDATE LIFETIME SHOTS/HITS
    const isHit = result === 'hit' ? 1 : 0;
    await db.query(
      "UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1 WHERE player_id = $2",
      [isHit, player_id]
    );

    // WIN DETECTION
    let gameStatus = 'active';
    let winnerId = null;

    if (result === 'hit') {
      const remaining = await db.query(
        `SELECT COUNT(*) FROM ships s 
         WHERE s.game_id = $1 AND s.player_id != $2
         AND NOT EXISTS (
           SELECT 1 FROM moves m 
           WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit'
         )`,
        [id, player_id]
      );

      if (parseInt(remaining.rows[0].count) === 0) {
        gameStatus = 'finished';
        winnerId = player_id;

        // Mark game finished
        await db.query("UPDATE games SET status = 'finished' WHERE game_id = $1", [id]);

        // STATS PERSISTENCE FIX: Increment lifetime wins for winner and losses for loser
        await db.query("UPDATE players SET wins = wins + 1 WHERE player_id = $1", [player_id]);
        await db.query(
          `UPDATE players SET losses = losses + 1 
           WHERE player_id IN (SELECT player_id FROM game_players WHERE game_id = $1 AND player_id != $2)`,
          [id, player_id]
        );
      }
    }

    // UPDATE TURN INDEX
    const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;
    await db.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, id]);

    const nextPlayerRes = await db.query(
      "SELECT player_id FROM game_players WHERE game_id = $1 AND turn_order = $2",
      [id, nextTurnIndex]
    );
    const next_player_id = (gameStatus === 'finished') ? null : (nextPlayerRes.rows[0]?.player_id || null);

    await db.query('COMMIT');
    res.json({ result, next_player_id, game_status: gameStatus, winner_id: winnerId });

  } catch (err) {
    if (db) await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT player_id, row, col, result FROM moves WHERE game_id = $1 ORDER BY move_id ASC", [id]);
    res.json({ moves: result.rows });
  } catch (err) {
    res.status(500).json({ error: "database error" });
  }
};