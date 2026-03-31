const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  // Requirement: exactly 3 ships
  if (!player_id || !ships || !Array.isArray(ships) || ships.length !== 3) {
    return res.status(400).json({ error: "exactly 3 ships required" });
  }

  // Check for internal overlaps in the request
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
    
    const playerInGame = await db.query("SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (playerInGame.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: "player not in game" });
    }

    const existing = await db.query("SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (existing.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "ships already placed" });
    }

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

    // 1. Lock game row for concurrency
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

    // 2. Turn Validation
    const turnRes = await db.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [id, player_id]
    );

    if (turnRes.rows.length === 0 || turnRes.rows[0].turn_order !== game.current_turn_index) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: "not your turn" });
    }

    // 3. Process the Shot
    const hitRes = await db.query(
      "SELECT player_id FROM ships WHERE game_id = $1 AND row = $2 AND col = $3 AND player_id != $4",
      [id, row, col, player_id]
    );

    const result = hitRes.rows.length > 0 ? "hit" : "miss";
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // 4. Update Attacker Stats (Shots/Hits)
    await db.query(
      "UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1 WHERE player_id = $2",
      [result === 'hit' ? 1 : 0, player_id]
    );

    // 5. Win Condition Logic (Multiplayer aware)
    let gameStatus = 'active';
    let winnerId = null;

    if (result === 'hit') {
      // Total ships in game = max_players * 3
      const totalShipsInGame = game.max_players * 3;
      
      // Count unique ship locations that have been hit across the whole game
      const totalHitsInGameRes = await db.query(
        `SELECT COUNT(DISTINCT s.ship_id) as hit_count
         FROM ships s
         JOIN moves m ON s.game_id = m.game_id AND s.row = m.row AND s.col = m.col
         WHERE s.game_id = $1 AND m.result = 'hit'`,
        [id]
      );

      const hitCount = parseInt(totalHitsInGameRes.rows[0].hit_count);
      
      // The shooter wins if the only ships NOT hit are their own (3 ships)
      // Or: Total Hits == Total Ships - Shooter's Ships
      if (hitCount >= (totalShipsInGame - 3)) {
        gameStatus = 'finished';
        winnerId = player_id;

        // Update Game Table
        await db.query(
          "UPDATE games SET status = 'finished', winner_id = $1 WHERE game_id = $2", 
          [winnerId, id]
        );

        // Update Lifetime Wins/Losses
        await db.query("UPDATE players SET wins = wins + 1 WHERE player_id = $1", [winnerId]);
        await db.query(
          `UPDATE players SET losses = losses + 1 
           WHERE player_id IN (SELECT player_id FROM game_players WHERE game_id = $1 AND player_id != $2)`,
          [id, winnerId]
        );
      }
    }

    // 6. Turn Rotation (Only rotate if game isn't over)
    const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;
    await db.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, id]);

    const nextPlayerRes = await db.query(
      "SELECT player_id FROM game_players WHERE game_id = $1 AND turn_order = $2",
      [id, nextTurnIndex]
    );
    const next_player_id = (gameStatus === 'finished') ? null : (nextPlayerRes.rows[0]?.player_id || null);

    await db.query('COMMIT');

    // Return the response exactly as test-a.py expects
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