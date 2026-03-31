const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  // 1. Requirement: exactly 3 ships
  if (!player_id || !ships || !Array.isArray(ships) || ships.length !== 3) {
    return res.status(400).json({ error: "exactly 3 ships required" });
  }

  // 2. Internal Overlap Check: Reject if the request contains duplicate coordinates
  const coords = new Set();
  for (const s of ships) {
    const key = `${s.row},${s.col}`;
    if (coords.has(key)) {
      return res.status(400).json({ error: "overlapping ships" });
    }
    coords.add(key);
  }

  try {
    const gameResult = await db.query("SELECT grid_size, status FROM games WHERE game_id = $1", [id]);
    if (gameResult.rows.length === 0) return res.status(404).json({ error: "game not found" });
    const { grid_size } = gameResult.rows[0];

    await db.query('BEGIN');
    
    // Player Validation
    const playerInGame = await db.query("SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (playerInGame.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "player not in game" });
    }

    // Duplicate Placement Check
    const existing = await db.query("SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (existing.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "ships already placed" });
    }

    // 3. Bounds Validation & Insertion
    for (const ship of ships) {
      if (ship.row < 0 || ship.row >= grid_size || ship.col < 0 || ship.col >= grid_size) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: "out of bounds" });
      }
      await db.query("INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)", [id, player_id, ship.row, ship.col]);
    }

    await db.query('COMMIT');
    res.status(200).json({ status: "ships_placed" });
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

    // 1. CONCURRENCY LOCK
    const gameRes = await db.query(
      "SELECT status, current_turn_index, max_players FROM games WHERE game_id = $1 FOR UPDATE", 
      [id]
    );

    if (gameRes.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "game not found" });
    }

    const game = gameRes.rows[0];
    if (game.status !== 'active') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "game not active" });
    }

    // 2. READINESS CHECK: All players must have placed ships (3 each)
    const shipCountRes = await db.query("SELECT COUNT(*) FROM ships WHERE game_id = $1", [id]);
    const totalShipsInGame = parseInt(shipCountRes.rows[0].count);
    const requiredShips = game.max_players * 3;

    if (totalShipsInGame < requiredShips) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "cannot fire before all players have placed ships" });
    }

    // 3. TURN VALIDATION
    const turnRes = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    if (turnRes.rows.length === 0 || turnRes.rows[0].turn_order !== game.current_turn_index) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "not your turn" });
    }

    // 4. PROCESS SHOT
    const hitRes = await db.query(
      "SELECT player_id FROM ships WHERE game_id = $1 AND row = $2 AND col = $3 AND player_id != $4",
      [id, row, col, player_id]
    );

    const result = hitRes.rows.length > 0 ? "hit" : "miss";
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // 5. UPDATE PLAYER STATS
    await db.query(
        "UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1 WHERE player_id = $2",
        [result === 'hit' ? 1 : 0, player_id]
    );

    let gameStatus = 'active';
    let winnerId = null;

    if (result === 'hit') {
      // WIN DETECTION (Multiplayer): Count how many distinct opponent ship locations have been hit
      const sunkOpponentShipsRes = await db.query(
        `SELECT COUNT(DISTINCT s.ship_id) as count
         FROM ships s
         JOIN moves m ON s.game_id = m.game_id AND s.row = m.row AND s.col = m.col
         WHERE s.game_id = $1 AND s.player_id != $2 AND m.result = 'hit'`,
        [id, player_id]
      );

      const sunkCount = parseInt(sunkOpponentShipsRes.rows[0].count);
      const totalOpponentShips = (game.max_players - 1) * 3;

      if (sunkCount >= totalOpponentShips) {
        gameStatus = 'finished';
        winnerId = player_id;
        await db.query("UPDATE games SET status = 'finished', winner_id = $1 WHERE game_id = $2", [winnerId, id]);
        await db.query("UPDATE players SET wins = wins + 1 WHERE player_id = $1", [winnerId]);
        await db.query(
            "UPDATE players SET losses = losses + 1 WHERE player_id IN (SELECT player_id FROM game_players WHERE game_id = $1 AND player_id != $2)",
            [id, winnerId]
        );
      }
    }

    // 6. TURN ROTATION
    const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;
    await db.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, id]);

    const nextPlayerRes = await db.query(
      "SELECT player_id FROM game_players WHERE game_id = $1 AND turn_order = $2",
      [id, nextTurnIndex]
    );
    const next_player_id = (gameStatus === 'finished') ? null : (nextPlayerRes.rows[0]?.player_id || null);

    await db.query('COMMIT');
    res.status(200).json({ 
        result, 
        next_player_id, 
        game_status: gameStatus, 
        winner_id: winnerId 
    });

  } catch (err) {
    if (db) await db.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: "database error" });
  }
};

exports.getMoves = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query("SELECT player_id, row, col, result FROM moves WHERE game_id = $1", [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "database error" });
    }
};