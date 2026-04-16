const API_BASE = "/api";

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

async function createGame() {
  const username = document.getElementById("username").value;

  if (!username) {
    setStatus("Enter a username first");
    return;
  }

  try {
    // create player
    const playerRes = await fetch(`${API_BASE}/players`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ username })
    });

    const player = await playerRes.json();

    // create game
    const gameRes = await fetch(`${API_BASE}/games`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        player_id: player.player_id,
        grid_size: 10
      })
    });

    const game = await gameRes.json();

    setStatus(`Game created! ID: ${game.game_id}`);

  } catch (err) {
    setStatus("Error creating game");
  }
}

async function joinGame() {
  const username = document.getElementById("username").value;
  const gameId = document.getElementById("gameId").value;

  if (!username || !gameId) {
    setStatus("Enter username and game ID");
    return;
  }

  try {
    // create player
    const playerRes = await fetch(`${API_BASE}/players`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ username })
    });

    const player = await playerRes.json();

    // join game
    await fetch(`${API_BASE}/games/${gameId}/join`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        player_id: player.player_id
      })
    });

    setStatus(`Joined game ${gameId}`);

  } catch (err) {
    setStatus("Error joining game");
  }
}

function playBot() {
  setStatus("Bot mode coming soon...");
}