const API_BASE = "/api";

let currentPlayerId = null;
let currentGameId = null;
let currentUsername = "";
let currentGameData = null;
let currentTurnOrder = null;
let pollInterval = null;

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function showLanding() {
  document.getElementById("landingView").classList.remove("hidden");
  document.getElementById("gameView").classList.add("hidden");
}

function showGame() {
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("gameView").classList.remove("hidden");
  startPolling();
}

function goHome() {
  stopPolling();
  showLanding();
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    if (currentGameId) {
      refreshGameState(true);
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function saveSession() {
  localStorage.setItem("battleship_username", currentUsername);
  localStorage.setItem("battleship_player_id", currentPlayerId);
  localStorage.setItem("battleship_game_id", currentGameId);
  localStorage.setItem("battleship_turn_order", currentTurnOrder ?? "");
}

function loadSession() {
  const savedUsername = localStorage.getItem("battleship_username");
  const savedPlayerId = localStorage.getItem("battleship_player_id");
  const savedGameId = localStorage.getItem("battleship_game_id");
  const savedTurnOrder = localStorage.getItem("battleship_turn_order");

  if (savedUsername) {
    document.getElementById("username").value = savedUsername;
    currentUsername = savedUsername;
  }

  if (savedPlayerId) {
    currentPlayerId = Number(savedPlayerId);
  }

  if (savedGameId) {
    currentGameId = Number(savedGameId);
    document.getElementById("gameId").value = savedGameId;
  }

  if (savedTurnOrder !== null && savedTurnOrder !== "") {
    currentTurnOrder = Number(savedTurnOrder);
  }
}

async function createPlayer(username) {
  const response = await fetch(`${API_BASE}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to create player");
  }

  return data.player_id;
}

async function createGame() {
  const username = document.getElementById("username").value.trim();

  if (!username) {
    setStatus("Enter a username first");
    return;
  }

  try {
    currentUsername = username;
    currentPlayerId = await createPlayer(username);
    currentTurnOrder = 0;

    const gameRes = await fetch(`${API_BASE}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator_id: currentPlayerId,
        grid_size: 10,
        max_players: 2
      })
    });

    const game = await gameRes.json();

    if (!gameRes.ok) {
      throw new Error(game.message || game.error || "Failed to create game");
    }

    currentGameId = game.game_id;
    saveSession();
    setStatus(`Game created! ID: ${currentGameId}`);

    showGame();
    await refreshGameState();
  } catch (err) {
    setStatus(err.message || "Error creating game");
  }
}

async function joinGame() {
  const username = document.getElementById("username").value.trim();
  const gameId = document.getElementById("gameId").value.trim();

  if (!username || !gameId) {
    setStatus("Enter username and game ID");
    return;
  }

  try {
    currentUsername = username;
    currentPlayerId = await createPlayer(username);

    const joinRes = await fetch(`${API_BASE}/games/${gameId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: currentPlayerId
      })
    });

    const joinData = await joinRes.json();

    if (!joinRes.ok) {
      throw new Error(joinData.message || joinData.error || "Failed to join game");
    }

    currentGameId = Number(gameId);
    currentTurnOrder = Number(joinData.turn_order);
    saveSession();
    setStatus(`Joined game ${gameId}`);

    showGame();
    await refreshGameState();
  } catch (err) {
    setStatus(err.message || "Error joining game");
  }
}

function playBot() {
  setStatus("Bot mode coming soon...");
}

function buildBoard(elementId, clickable = false) {
  const board = document.getElementById(elementId);
  board.innerHTML = "";

  for (let i = 0; i < 100; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";

    if (clickable) {
      cell.classList.add("targetable");
      cell.dataset.index = i;
      cell.addEventListener("click", () => {
        const row = Math.floor(i / 10);
        const col = i % 10;
        fireShot(row, col);
      });
    }

    board.appendChild(cell);
  }
}

async function refreshGameState(silent = false) {
  if (!currentGameId) return;

  try {
    const response = await fetch(`${API_BASE}/games/${currentGameId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Could not load game");
    }

    currentGameData = data;
    renderGameInfo(data);
    buildBoards();
  } catch (err) {
    if (!silent) {
      document.getElementById("gameStatusOnly").textContent = err.message;
    }
  }
}

function renderGameInfo(game) {
  const status = game.status || "unknown";
  const activePlayers = Number(game.active_players || 0);
  const maxPlayers = Number(game.max_players || 0);
  const currentTurnIndex = Number(game.current_turn_index ?? -1);

  document.getElementById("yourBoardLabel").textContent = `${currentUsername}'s Board`;
  document.getElementById("enemyBoardLabel").textContent = "Opponent Board";

  let message = `Game status: ${status} | Players: ${activePlayers}/${maxPlayers}`;

  if (status === "waiting_setup" && activePlayers < maxPlayers) {
    message = "Waiting for another player to join...";
  }

  if (status === "waiting_setup" && activePlayers === maxPlayers) {
    message = "Place your ships!";
  }

  if (status === "playing") {
    message = currentTurnOrder === currentTurnIndex ? "Your turn" : "Opponent's turn";
  }

  if (status === "finished") {
    message = "Game finished";
  }

  document.getElementById("gameStatusOnly").textContent = message;

  const placeBtn = document.getElementById("placeShipsBtn");
  if (status === "waiting_setup" && activePlayers === maxPlayers) {
    placeBtn.classList.remove("hidden");
  } else {
    placeBtn.classList.add("hidden");
  }

  updateTurnBadges(currentTurnIndex, status);
}

function updateTurnBadges(currentTurnIndex, status) {
  const youBadge = document.getElementById("youTurnBadge");
  const opponentBadge = document.getElementById("opponentTurnBadge");

  youBadge.classList.remove("active");
  opponentBadge.classList.remove("active");

  if (status !== "playing") {
    return;
  }

  if (Number(currentTurnOrder) === Number(currentTurnIndex)) {
    youBadge.classList.add("active");
  } else {
    opponentBadge.classList.add("active");
  }
}

function buildBoards() {
  const canFire =
    currentGameData &&
    currentGameData.status === "playing" &&
    Number(currentTurnOrder) === Number(currentGameData.current_turn_index);

  buildBoard("playerBoard", false);
  buildBoard("enemyBoard", canFire);
}

async function submitDefaultShips() {
  if (!currentGameId || !currentPlayerId) return;

  try {
    const response = await fetch(`${API_BASE}/games/${currentGameId}/place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: currentPlayerId,
        ships: [
          { row: 0, col: 0 },
          { row: 1, col: 1 },
          { row: 2, col: 2 }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Ship placement failed");
    }

    document.getElementById("gameStatusOnly").textContent =
      "Ships placed. Waiting for the other player...";
    await refreshGameState();
  } catch (err) {
    document.getElementById("gameStatusOnly").textContent = err.message;
  }
}

async function fireShot(row, col) {
  if (!currentGameId || !currentPlayerId) return;

  try {
    const response = await fetch(`${API_BASE}/games/${currentGameId}/fire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: currentPlayerId,
        row,
        col
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Shot failed");
    }

    document.getElementById("gameStatusOnly").textContent =
      `Shot result: ${data.result} | Game: ${data.game_status}`;

    await refreshGameState();
  } catch (err) {
    document.getElementById("gameStatusOnly").textContent = err.message;
  }
}

window.addEventListener("load", () => {
  loadSession();
});