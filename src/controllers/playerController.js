const db = require("../db");

exports.createPlayer = async (req, res) => {
  const { username } = req.body || {};

  // Contract requires alphanumeric + underscores, 1-30 chars
  const usernameRegex = /^[A-Za-z0-9_]+$/;

  if (
    typeof username !== "string" || 
    username.length < 1 || 
    username.length > 30 || 
    !usernameRegex.test(username)
  ) {
    return res.status(400).json({ 
      error: "bad_request", 
      message: "Username must be 1-30 characters and alphanumeric with underscores only" 
    });
  }

  try {
    // ON CONFLICT satisfies the contract requirement for "Create or reuse player"
    const result = await db.query(
      `INSERT INTO players(username, wins, losses, total_shots, total_hits, games_played) 
       VALUES($1, 0, 0, 0, 0, 0) 
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
       RETURNING player_id`,
      [username]
    );

    return res.status(201).json({ player_id: result.rows[0].player_id });
  } catch (err) {
    console.error("Create Player Error:", err.message);
    return res.status(500).json({ 
      error: "server_error", 
      message: "database error during player creation" 
    });
  }
};

exports.getStats = async (req, res) => {
  const { id } = req.params;
  
  try {
    const playerRes = await db.query(
      "SELECT wins, losses, games_played, total_shots, total_hits FROM players WHERE player_id = $1",
      [id]
    );

    if (playerRes.rows.length === 0) {
      return res.status(404).json({ 
        error: "not_found", 
        message: "Player does not exist" 
      });
    }

    const player = playerRes.rows[0];
    const total_shots = parseInt(player.total_shots) || 0;
    const total_hits = parseInt(player.total_hits) || 0;
    const accuracyValue = total_shots > 0 ? (total_hits / total_shots) : 0.0;

    // Schema requires specific fields and types (accuracy as number/float)
    return res.status(200).json({
      games_played: parseInt(player.games_played) || 0,
      wins: parseInt(player.wins) || 0,
      losses: parseInt(player.losses) || 0,
      total_shots: total_shots,
      total_hits: total_hits,
      accuracy: parseFloat(accuracyValue.toFixed(3))
    });
  } catch (err) {
    console.error("Get Stats Error:", err.message);
    return res.status(500).json({ 
      error: "server_error", 
      message: "database error retrieving statistics" 
    });
  }
};