const API_BASE = "/api";

let currentPlayerId = null;
let currentGameId = null;
let currentUsername = "";
let currentGameData = null;

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
}

function goHome() {
  showLanding();
}

function saveSession() {
  localStorage.setItem("battleship_username", currentUsername);
  localStorage.setItem("battleship_player_id", currentPlayerId);
  localStorage.setItem("battleship_game_id", currentGameId);
}

function loadSession() {
  const savedUsername = localStorage.getItem("battleship_username");
  const savedPlayerId = localStorage.getItem("battleship_player_id");
  const savedGameId = localStorage.getItem("battleship_game_id");

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

    const gameRes = await fetch(`${API_BASE}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: currentPlayerId,
        grid_size: 10
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

function markCell(boardId, row, col, className) {
  const index = row * 10 + col;
  const board = document.getElementById(boardId);
  const cell = board.children[index];
  if (cell) {
    cell.classList.add(className);
  }
}

async function refreshGameState() {
  if (!currentGameId) return;

  try {
    const response = await fetch(`${API_BASE}/games/${currentGameId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Could not load game");
    }

    currentGameData = data;
    renderGameInfo(data);
    buildBoardsFromState(data);
  } catch (err) {
    document.getElementById("gameStatusText").textContent = err.message;
  }
}

function renderGameInfo(game) {
  document.getElementById("playerName").textContent = currentUsername || "-";
  document.getElementById("playerIdText").textContent = currentPlayerId || "-";
  document.getElementById("gameIdText").textContent = currentGameId || "-";

  const currentTurn =
    game.current_turn_player_id ||
    game.current_player_id ||
    game.current_turn_index ||
    "-";

  document.getElementById("turnText").textContent = currentTurn;
  document.getElementById("gameStatusText").textContent =
    `Status: ${game.status || "unknown"}`;
}

function buildBoardsFromState(game) {
  buildBoard("playerBoard", false);
  buildBoard("enemyBoard", true);

  if (Array.isArray(game.ships)) {
    game.ships.forEach((ship) => {
      const ownerId = ship.player_id;
      const row = ship.row;
      const col = ship.col;

      if (Number(ownerId) === Number(currentPlayerId)) {
        markCell("playerBoard", row, col, "ship");
      }
    });
  }

  if (Array.isArray(game.moves)) {
    game.moves.forEach((move) => {
      const row = move.row;
      const col = move.col;
      const hitClass = move.hit ? "hit" : "miss";

      if (Number(move.player_id) === Number(currentPlayerId)) {
        markCell("enemyBoard", row, col, hitClass);
      } else {
        markCell("playerBoard", row, col, hitClass);
      }
    });
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

    await refreshGameState();
  } catch (err) {
    document.getElementById("gameStatusText").textContent = err.message;
  }
}

window.addEventListener("load", () => {
  loadSession();
});