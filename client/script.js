const API_BASE = "/api";

let currentPlayerId = null;
let currentGameId = null;
let currentUsername = "";
let currentGameData = null;
let currentTurnOrder = null;
let currentGridSize = 10;
let pollInterval = null;

let placementMode = false;
let pendingShips = [];

const STORAGE_KEYS = {
  username: "battleship_username",
  playerId: "battleship_player_id",
  gameId: "battleship_game_id",
  turnOrder: "battleship_turn_order",
  gridSize: "battleship_grid_size",
  placedShipsPrefix: "battleship_placed_ships_"
};

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

function openCreateGameModal() {
  document.getElementById("createGameModal").classList.remove("hidden");
}

function closeCreateGameModal() {
  document.getElementById("createGameModal").classList.add("hidden");
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
  localStorage.setItem(STORAGE_KEYS.username, currentUsername);
  localStorage.setItem(STORAGE_KEYS.playerId, currentPlayerId);
  localStorage.setItem(STORAGE_KEYS.gameId, currentGameId);
  localStorage.setItem(STORAGE_KEYS.turnOrder, currentTurnOrder ?? "");
  localStorage.setItem(STORAGE_KEYS.gridSize, currentGridSize);
}

function loadSession() {
  const savedUsername = localStorage.getItem(STORAGE_KEYS.username);
  const savedPlayerId = localStorage.getItem(STORAGE_KEYS.playerId);
  const savedGameId = localStorage.getItem(STORAGE_KEYS.gameId);
  const savedTurnOrder = localStorage.getItem(STORAGE_KEYS.turnOrder);
  const savedGridSize = localStorage.getItem(STORAGE_KEYS.gridSize);

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

  if (savedGridSize) {
    currentGridSize = Number(savedGridSize);
  }
}

function placedShipsKey() {
  return `${STORAGE_KEYS.placedShipsPrefix}${currentGameId}_${currentPlayerId}`;
}

function savePlacedShips(ships) {
  localStorage.setItem(placedShipsKey(), JSON.stringify(ships));
}

function loadPlacedShips() {
  const raw = localStorage.getItem(placedShipsKey());
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
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

async function createGameFromModal() {
  const username = document.getElementById("username").value.trim();
  const gridSize = Number(document.getElementById("gridSizeSelect").value);
  const maxPlayers = Number(document.getElementById("maxPlayersSelect").value);

  if (!username) {
    setStatus("Enter a username first");
    return;
  }

  try {
    currentUsername = username;
    currentPlayerId = await createPlayer(username);
    currentTurnOrder = 0;
    currentGridSize = gridSize;

    const gameRes = await fetch(`${API_BASE}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creator_id: currentPlayerId,
        grid_size: gridSize,
        max_players: maxPlayers
      })
    });

    const game = await gameRes.json();

    if (!gameRes.ok) {
      throw new Error(game.message || game.error || "Failed to create game");
    }

    currentGameId = game.game_id;
    saveSession();
    closeCreateGameModal();
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

function buildBoard(elementId, clickable = false, onCellClick = null) {
  const board = document.getElementById(elementId);
  board.innerHTML = "";
  board.style.gridTemplateColumns = `repeat(${currentGridSize}, 36px)`;

  for (let i = 0; i < currentGridSize * currentGridSize; i++) {
    const row = Math.floor(i / currentGridSize);
    const col = i % currentGridSize;

    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.row = row;
    cell.dataset.col = col;

    if (clickable && onCellClick) {
      cell.classList.add(elementId === "enemyBoard" ? "targetable" : "placeable");
      cell.addEventListener("click", () => onCellClick(row, col));
    }

    board.appendChild(cell);
  }
}

function getCell(boardId, row, col) {
  const index = row * currentGridSize + col;
  const board = document.getElementById(boardId);
  return board.children[index] || null;
}

function markCell(boardId, row, col, className) {
  const cell = getCell(boardId, row, col);
  if (cell) {
    cell.classList.add(className);
  }
}

async function refreshGameState(silent = false) {
  if (!currentGameId) return;

  try {
    const [gameRes, movesRes] = await Promise.all([
      fetch(`${API_BASE}/games/${currentGameId}`),
      fetch(`${API_BASE}/games/${currentGameId}/moves`)
    ]);

    const game = await gameRes.json();
    const moves = await movesRes.json();

    if (!gameRes.ok) {
      throw new Error(game.message || game.error || "Could not load game");
    }

    if (!movesRes.ok) {
      throw new Error(moves.message || moves.error || "Could not load moves");
    }

    currentGameData = {
      ...game,
      moves: Array.isArray(moves) ? moves : []
    };

    currentGridSize = Number(game.grid_size || currentGridSize || 10);
    saveSession();

    renderGameInfo(currentGameData);
    renderBoards();
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
  } else if (status === "waiting_setup" && activePlayers === maxPlayers) {
    const placed = loadPlacedShips();
    message = placed.length === 3
      ? "Ships placed. Waiting for the other player..."
      : "Place your ships!";
  } else if (status === "playing") {
    message = currentTurnOrder === currentTurnIndex ? "Your turn" : "Opponent's turn";
  } else if (status === "finished") {
    message = "Game finished";
  }

  document.getElementById("gameStatusOnly").textContent = message;

  const canPlaceNow = status === "waiting_setup" && activePlayers === maxPlayers;
  const hasPlaced = loadPlacedShips().length === 3;

  document.getElementById("startPlacementBtn").classList.toggle(
    "hidden",
    !canPlaceNow || hasPlaced || placementMode
  );
  document.getElementById("submitPlacementBtn").classList.toggle("hidden", !placementMode);
  document.getElementById("clearPlacementBtn").classList.toggle("hidden", !placementMode);
  document.getElementById("placementHelp").classList.toggle("hidden", !placementMode);

  updateTurnBadges(currentTurnIndex, status);
}

function updateTurnBadges(currentTurnIndex, status) {
  const youBadge = document.getElementById("youTurnBadge");
  const opponentBadge = document.getElementById("opponentTurnBadge");

  youBadge.classList.remove("active");
  opponentBadge.classList.remove("active");

  if (status !== "playing") return;

  if (Number(currentTurnOrder) === Number(currentTurnIndex)) {
    youBadge.classList.add("active");
  } else {
    opponentBadge.classList.add("active");
  }
}

function enablePlacementMode() {
  placementMode = true;
  pendingShips = [];
  renderBoards();
}

function clearPlacementSelection() {
  pendingShips = [];
  renderBoards();
}

function togglePendingShip(row, col) {
  const existingIndex = pendingShips.findIndex((s) => s.row === row && s.col === col);

  if (existingIndex >= 0) {
    pendingShips.splice(existingIndex, 1);
  } else {
    if (pendingShips.length >= 3) return;
    pendingShips.push({ row, col });
  }

  renderBoards();
}

async function submitPlacedShips() {
  if (!currentGameId || !currentPlayerId) return;

  if (pendingShips.length !== 3) {
    document.getElementById("gameStatusOnly").textContent = "Select exactly 3 ship cells.";
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/games/${currentGameId}/place`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: currentPlayerId,
        ships: pendingShips
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Ship placement failed");
    }

    savePlacedShips(pendingShips);
    placementMode = false;
    pendingShips = [];

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

function renderBoards() {
  const canFire =
    currentGameData &&
    currentGameData.status === "playing" &&
    Number(currentTurnOrder) === Number(currentGameData.current_turn_index);

  buildBoard("playerBoard", placementMode, togglePendingShip);
  buildBoard("enemyBoard", canFire, fireShot);

  const placedShips = loadPlacedShips();
  placedShips.forEach((ship) => {
    markCell("playerBoard", ship.row, ship.col, "ship");
  });

  pendingShips.forEach((ship) => {
    markCell("playerBoard", ship.row, ship.col, "pending-ship");
  });

  const moves = currentGameData?.moves || [];

  for (const move of moves) {
    const row = Number(move.row);
    const col = Number(move.col);
    const resultClass = move.result === "hit" ? "hit" : "miss";

    if (Number(move.player_id) === Number(currentPlayerId)) {
      markCell("enemyBoard", row, col, resultClass);
    } else {
      markCell("playerBoard", row, col, resultClass);
    }
  }
}

window.addEventListener("load", () => {
  loadSession();
});