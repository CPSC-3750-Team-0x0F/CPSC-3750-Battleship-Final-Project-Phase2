const db = require("../db");

// ... placeShips remains the same ...

exports.fireShot = async (req, res) => {
  const { id } = req.params;
  const { player_id, row, col } = req.body;

  try {
    // Fetch game state and player turn info in one go
    const gameQuery = await db.query(
      `SELECT g.*, gp.turn_order,
      (SELECT COUNT(*) FROM ships WHERE game_id = $1) as ships_placed
       FROM games g 
       LEFT JOIN game_players gp ON g.game_id = gp.game_id AND gp.player_id = $2
       WHERE g.game_id = $1`,
      [id, player_id]
    );

    if (gameQuery.rows.length === 0) return res.status(404).json({ error: "game not found" });

    const game = gameQuery.rows[0];

    // 1. Fire Gating
    if (parseInt(game.ships_placed) < (parseInt(game.max_players) * 3)) {
      return res.status(400).json({ error: "all players must place ships first" });
    }

    // 2. Identity Check
    if (game.turn_order === null) return res.status(403).json({ error: "player not in game" });

    // 3. Turn & Status Enforcement
    if (game.status.toLowerCase() !== 'active') {
      return res.status(400).json({ error: "game not active" });
    }
    if (parseInt(game.current_turn_index) !== parseInt(game.turn_order)) {
      return res.status(400).json({ error: "not your turn" });
    }

    // 4. Process Shot
    await db.query('BEGIN');
    const targetShip = await db.query(
      "SELECT * FROM ships WHERE game_id=$1 AND player_id != $2 AND row=$3 AND col=$4",
      [id, player_id, row, col]
    );

    const result = targetShip.rows.length > 0 ? "hit" : "miss";
    await db.query(
      "INSERT INTO moves(game_id, player_id, row, col, result) VALUES($1, $2, $3, $4, $5)",
      [id, player_id, row, col, result]
    );

    // 5. Update Turn
    const nextTurnIndex = (parseInt(game.current_turn_index) + 1) % parseInt(game.max_players);
    await db.query("UPDATE games SET current_turn_index = $1 WHERE game_id = $2", [nextTurnIndex, id]);

    // 6. Win Condition
    let gameStatus = 'active';
    if (result === "hit") {
      const remaining = await db.query(
        `SELECT COUNT(*) FROM ships s WHERE s.game_id = $1 AND s.player_id != $2
         AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id=s.game_id AND m.row=s.row AND m.col=s.col AND m.result='hit')`,
        [id, player_id]
      );
      if (parseInt(remaining.rows[0].count) === 0) {
        gameStatus = 'completed';
        await db.query("UPDATE games SET status = 'completed' WHERE game_id = $1", [id]);
      }
    }

    await db.query('COMMIT');
    res.json({ result, next_player_id: null, game_status: gameStatus });

  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: "database error" });
  }
};