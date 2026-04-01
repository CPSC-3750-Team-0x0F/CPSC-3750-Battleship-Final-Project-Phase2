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

  const isStrictInt = (value) =>
    (typeof value === "number" && Number.isInteger(value)) ||
    (typeof value === "string" && /^-?\d+$/.test(value));

  if (
    !isStrictInt(id) ||
    !isStrictInt(player_id) ||
    !isStrictInt(row) ||
    !isStrictInt(col)
  ) {
    return res.status(400).json({ error: "invalid numeric input" });
  }

  const gameId = Number(id);
  const shooterId = Number(player_id);
  const shotRow = Number(row);
  const shotCol = Number(col);

  const client = typeof db.connect === "function" ? await db.connect() : db;

  try {
    await client.query("BEGIN");

    const gameRes = await client.query(
      `SELECT game_id, grid_size, status, current_turn_index, max_players
       FROM games
       WHERE game_id = $1
       FOR UPDATE`,
      [gameId]
    );

    if (gameRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "game not found" });
    }

    const game = gameRes.rows[0];

    const turnRes = await client.query(
      "SELECT turn_order FROM game_players WHERE game_id = $1 AND player_id = $2",
      [gameId, shooterId]
    );

    if (turnRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "player not in game" });
    }

    if (game.status === "finished") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "game already finished" });
    }

    if (game.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "game not active" });
    }

    if (
      shotRow < 0 ||
      shotRow >= game.grid_size ||
      shotCol < 0 ||
      shotCol >= game.grid_size
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "fire coordinates out of bounds" });
    }

    const shipsReadyRes = await client.query(
      `SELECT COUNT(DISTINCT player_id) AS players_with_ships
       FROM ships
       WHERE game_id = $1`,
      [gameId]
    );

    const playersWithShips = parseInt(shipsReadyRes.rows[0].players_with_ships, 10);

    if (playersWithShips < game.max_players) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "cannot fire before all players have placed ships" });
    }

    if (turnRes.rows[0].turn_order !== game.current_turn_index) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "not your turn" });
    }

    const shotExistsRes = await client.query(
      "SELECT 1 FROM moves WHERE game_id = $1 AND row = $2 AND col = $3",
      [gameId, shotRow, shotCol]
    );

    if (shotExistsRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "already fired here" });
    }

    const hitRes = await client.query(
      `SELECT ship_id, player_id
       FROM ships
       WHERE game_id = $1
         AND row = $2
         AND col = $3
         AND player_id != $4`,
      [gameId, shotRow, shotCol, shooterId]
    );

    const result = hitRes.rows.length > 0 ? "hit" : "miss";

    await client.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [gameId, shooterId, shotRow, shotCol, result]
    );

    await client.query(
      `UPDATE players
       SET total_shots = total_shots + 1,
           total_hits = total_hits + $1
       WHERE player_id = $2`,
      [result === "hit" ? 1 : 0, shooterId]
    );

    let gameStatus = "active";
    let winnerId = null;
    let next_player_id = null;

    if (result === "hit") {
      const totalOpponentShipsRes = await client.query(
        `SELECT COUNT(*) AS count
         FROM ships
         WHERE game_id = $1
           AND player_id != $2`,
        [gameId, shooterId]
      );

      const sunkOpponentShipsRes = await client.query(
        `SELECT COUNT(DISTINCT s.ship_id) AS count
         FROM ships s
         JOIN moves m
           ON s.game_id = m.game_id
          AND s.row = m.row
          AND s.col = m.col
         WHERE s.game_id = $1
           AND s.player_id != $2
           AND m.result = 'hit'`,
        [gameId, shooterId]
      );

      const totalOpponentShips = parseInt(totalOpponentShipsRes.rows[0].count, 10);
      const sunkCount = parseInt(sunkOpponentShipsRes.rows[0].count, 10);

      if (totalOpponentShips > 0 && sunkCount >= totalOpponentShips) {
        gameStatus = "finished";
        winnerId = shooterId;

        await client.query(
          "UPDATE games SET status = 'finished', winner_id = $1 WHERE game_id = $2",
          [winnerId, gameId]
        );

        await client.query(
          `UPDATE players
           SET wins = wins + 1,
               games_played = games_played + 1
           WHERE player_id = $1`,
          [winnerId]
        );

        await client.query(
          `UPDATE players
           SET losses = losses + 1,
               games_played = games_played + 1
           WHERE player_id IN (
             SELECT player_id
             FROM game_players
             WHERE game_id = $1
               AND player_id != $2
           )`,
          [gameId, winnerId]
        );
      }
    }

    if (gameStatus !== "finished") {
      const nextTurnIndex = (game.current_turn_index + 1) % game.max_players;

      await client.query(
        "UPDATE games SET current_turn_index = $1 WHERE game_id = $2",
        [nextTurnIndex, gameId]
      );

      const nextPlayerRes = await client.query(
        "SELECT player_id FROM game_players WHERE game_id = $1 AND turn_order = $2",
        [gameId, nextTurnIndex]
      );

      next_player_id = nextPlayerRes.rows[0]?.player_id || null;
    }

    await client.query("COMMIT");

    return res.status(200).json({
      result,
      next_player_id,
      game_status: gameStatus,
      winner_id: winnerId
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    console.error(err);
    return res.status(500).json({ error: "database error" });
  } finally {
    if (client !== db && typeof client.release === "function") {
      client.release();
    }
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