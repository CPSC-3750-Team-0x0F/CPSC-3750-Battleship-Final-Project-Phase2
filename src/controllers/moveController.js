const db = require("../db");

exports.placeShips = async (req, res) => {
  const { id } = req.params;
  const { player_id, ships } = req.body;

  // Contract: exactly 3 ships
  if (!player_id || !ships || !Array.isArray(ships) || ships.length !== 3) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "exactly 3 ships required" 
    });
  }

  // Internal Overlap Check
  const coords = new Set();
  for (const s of ships) {
    const key = `${s.row},${s.col}`;
    if (coords.has(key)) {
      return res.status(400).json({ 
        error: "bad_request", 
        message: "overlapping ships" 
      });
    }
    coords.add(key);
  }

  try {
    const gameResult = await db.query("SELECT grid_size, status, max_players FROM games WHERE game_id = $1", [id]);
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ 
        error: "not_found", 
        message: "game not found" 
      });
    }
    const { grid_size, max_players } = gameResult.rows[0];

    await db.query('BEGIN');
    
    const playerInGame = await db.query("SELECT 1 FROM game_players WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (playerInGame.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ 
        error: "not_found", 
        message: "player not in game" 
      });
    }

    const existing = await db.query("SELECT 1 FROM ships WHERE game_id = $1 AND player_id = $2", [id, player_id]);
    if (existing.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ 
        error: "bad_request", 
        message: "ships already placed" 
      });
    }

    for (const ship of ships) {
      if (ship.row < 0 || ship.row >= grid_size || ship.col < 0 || ship.col >= grid_size) {
        await db.query('ROLLBACK');
        return res.status(400).json({ 
          error: "bad_request", 
          message: "out of bounds" 
        });
      }
      await db.query("INSERT INTO ships(game_id, player_id, row, col) VALUES($1, $2, $3, $4)", [id, player_id, ship.row, ship.col]);
    }

    // Check if all players have now placed ships to transition state
    const shipsReadyRes = await db.query(
      "SELECT COUNT(DISTINCT player_id) AS count FROM ships WHERE game_id = $1",
      [id]
    );
    
    if (parseInt(shipsReadyRes.rows[0].count) === max_players) {
      await db.query("UPDATE games SET status = 'playing' WHERE game_id = $1", [id]);
    }

    await db.query('COMMIT');
    res.status(200).json({ status: "ships_placed" });
  } catch (err) {
    if (db) await db.query('ROLLBACK');
    res.status(500).json({ 
      error: "server_error", 
      message: "database error" 
    });
  }
};

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  const isStrictInt = (value) =>
    (typeof value === "number" && Number.isInteger(value)) ||
    (typeof value === "string" && /^-?\d+$/.test(value));

  if (!isStrictInt(id) || !isStrictInt(player_id) || !isStrictInt(row) || !isStrictInt(col)) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "invalid numeric input" 
    });
  }

  const gameId = Number(id);
  const shooterId = Number(player_id);
  const shotRow = Number(row);
  const shotCol = Number(col);

  const client = typeof db.connect === "function" ? await db.connect() : db;

  try {
    await client.query("BEGIN");

    const gameRes = await client.query(
      "SELECT grid_size, status, current_turn_index, max_players FROM games WHERE game_id = $1 FOR UPDATE",
      [gameId]
    );

    if (gameRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "game not found" });
    }

    const game = gameRes.rows[0];

    if (game.status === "finished") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "bad_request", message: "game already finished" });
    }

    if (game.status !== "playing") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "bad_request", message: "game not in playing state" });
    }

    const turnRes = await client.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, shooterId]
    );

    if (turnRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found", message: "player not in game" });
    }

    if (turnRes.rows[0].turn_order !== game.current_turn_index) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "not_your_turn", message: "it is not your turn" });
    }

    if (shotRow < 0 || shotRow >= game.grid_size || shotCol < 0 || shotCol >= game.grid_size) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "bad_request", message: "coordinates out of bounds" });
    }

    const shotExistsRes = await client.query(
      "SELECT 1 FROM moves WHERE game_id = $1 AND row = $2 AND col = $3",
      [gameId, shotRow, shotCol]
    );

    if (shotExistsRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "conflict", message: "already fired here" });
    }

    const hitRes = await client.query(
      "SELECT player_id FROM ships WHERE game_id = $1 AND row = $2 AND col = $3 AND player_id != $4",
      [gameId, shotRow, shotCol, shooterId]
    );

    const result = hitRes.rows.length > 0 ? "hit" : "miss";

    await client.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [gameId, shooterId, shotRow, shotCol, result]
    );

    await client.query(
      "UPDATE players SET total_shots = total_shots + 1, total_hits = total_hits + $1 WHERE player_id = $2",
      [result === "hit" ? 1 : 0, shooterId]
    );

    let gameStatus = "playing";
    let winnerId = null;

    if (result === "hit") {
      const remainingOpponentShips = await client.query(
        `SELECT COUNT(*) FROM ships s 
         WHERE game_id = $1 AND player_id != $2 
         AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = s.game_id AND m.row = s.row AND m.col = s.col AND m.result = 'hit')`,
        [gameId, shooterId]
      );

      if (parseInt(remainingOpponentShips.rows[0].count) === 0) {
        gameStatus = "finished";
        winnerId = shooterId;
        await client.query("UPDATE games SET status = 'finished', winner_id = $1 WHERE game_id = $2", [winnerId, gameId]);
        await client.query("UPDATE players SET wins = wins + 1, games_played = games_played + 1 WHERE player_id = $1", [winnerId]);
        await client.query(
          "UPDATE players SET losses = losses + 1, games_played = games_played + 1 WHERE player_id IN (SELECT player_id FROM game_players WHERE game_id = $1 AND player_id != $2)",
          [gameId, winnerId]
        );
      }
    }

    let next_player_id = null;
    if (gameStatus !== "finished") {
      const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;
      await client.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, gameId]);
      const nextPlayerRes = await client.query(
        "SELECT player_id FROM game_players WHERE game_id = $1 AND turn_order = $2",
        [gameId, nextTurnIndex]
      );
      next_player_id = nextPlayerRes.rows[0]?.player_id;
    }

    await client.query("COMMIT");
    return res.status(200).json({ result, next_player_id, game_status: gameStatus, winner_id: winnerId });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    return res.status(500).json({ error: "server_error", message: "database error" });
  } finally {
    if (client !== db && typeof client.release === "function") client.release();
  }
};

exports.getMoves = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT player_id, row, col, result FROM moves WHERE game_id = $1", [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "server_error", message: "database error" });
  }
};