let SERVER_BASE = localStorage.getItem("battleship_server_url") || "";

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

function getApiBase() {
  return `${SERVER_BASE}/api`;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function setServerStatus(message, type = "") {
  const el = document.getElementById("serverConnectionStatus");
  el.textContent = message;
  el.className = "server-status";
  if (type) {
    el.classList.add(type);
  }
}

function updateServerDisplay() {
  document.getElementById("currentServerDisplay").textContent =
    SERVER_BASE ? `Server: ${SERVER_BASE}` : "Server: None";
}

function renderAvailableGames(games) {
  const container = document.getElementById("availableGamesList");
  if (!container) return;

  if (!Array.isArray(games) || games.length === 0) {
    container.innerHTML = `<p class="empty-games">No open games available.</p>`;
    return;
  }

  const openGames = games.filter((game) => {
    const status = String(game.status || "").toLowerCase();
    return status === "waiting" || status === "waiting_setup";
  });

  if (openGames.length === 0) {
    container.innerHTML = `<p class="empty-games">No joinable games right now.</p>`;
    return;
  }

  container.innerHTML = openGames
    .map((game) => {
      const gameId = game.game_id;
      const status = game.status;

      return `
        <div class="game-list-item">
          <div class="game-list-info">
            <p><strong>Game ID:</strong> ${gameId}</p>
            <p><strong>Status:</strong> ${status}</p>
          </div>
          <button onclick="selectGameFromList(${gameId})">Join</button>
        </div>
      `;
    })
    .join("");
}

function selectGameFromList(gameId) {
  document.getElementById("gameId").value = gameId;
  setStatus(`Selected game ${gameId}. Enter your username and click Join Game.`);
}

async function loadAvailableGames() {
  if (!requireServer()) return;

  const container = document.getElementById("availableGamesList");
  if (container) {
    container.innerHTML = `<p class="empty-games">Loading games...</p>`;
  }

  try {
    const response = await fetch(`${getApiBase()}/games`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Failed to load games");
    }

    const games = Array.isArray(data) ? data : data.games || [];
    renderAvailableGames(games);
  } catch (err) {
    if (container) {
      container.innerHTML = `<p class="empty-games">Could not load games.</p>`;
    }
    setStatus(err.message || "Error loading available games");
  }
}

function formatMoveTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function renderMoveHistory(moves = []) {
  const container = document.getElementById("moveHistoryList");
  if (!container) return;

  if (!Array.isArray(moves) || moves.length === 0) {
    container.innerHTML = `<p class="empty-history">No moves yet.</p>`;
    return;
  }

  const sortedMoves = [...moves].reverse();

  container.innerHTML = sortedMoves
    .map((move, index) => {
      const row = Number(move.row);
      const col = Number(move.col);
      const result = String(move.result || (move.hit ? "hit" : "miss")).toLowerCase();
      const isYou = Number(move.player_id) === Number(currentPlayerId);
      const playerLabel = isYou ? "You" : "Opponent";

      const timestampValue = move.timestamp || move.created_at || move.move_time;
      const formattedTimestamp = formatMoveTimestamp(timestampValue);

      return `
        <div class="move-history-item">
          <div class="move-history-main">
            <div class="move-history-shot">${playerLabel} fired at (${row}, ${col})</div>
            <div class="move-history-meta">
              Move #${moves.length - index}${formattedTimestamp ? ` • ${formattedTimestamp}` : ""}
            </div>
          </div>
          <div class="move-result ${result}">${result.toUpperCase()}</div>
        </div>
      `;
    })
    .join("");
}

async function connectToServer() {
  const input = document.getElementById("serverUrl").value.trim();

  if (!input) {
    setServerStatus("Please enter a server URL.", "error");
    setStatus("Enter a server URL first.");
    return;
  }

  const cleaned = input.replace(/\/+$/, "");

  try {
    const response = await fetch(`${cleaned}/api`, {
      method: "GET"
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    SERVER_BASE = cleaned;
    localStorage.setItem("battleship_server_url", SERVER_BASE);
    updateServerDisplay();
    setServerStatus("Connection successful.", "success");
    setStatus("Connected to server successfully.");
    loadAvailableGames();
  } catch (err) {
    setServerStatus("Connection failed.", "error");
    setStatus(err.message || "Could not connect to that server.");
  }
}

function clearGameSessionStorage() {
  localStorage.removeItem(STORAGE_KEYS.username);
  localStorage.removeItem(STORAGE_KEYS.playerId);
  localStorage.removeItem(STORAGE_KEYS.gameId);
  localStorage.removeItem(STORAGE_KEYS.turnOrder);
  localStorage.removeItem(STORAGE_KEYS.gridSize);

  if (currentGameId && currentPlayerId) {
    localStorage.removeItem(placedShipsKey());
  }
}

function resetClientServer() {
  stopPolling();
  closeLobbyModal();

  currentPlayerId = null;
  currentGameId = null;
  currentUsername = "";
  currentGameData = null;
  currentTurnOrder = null;
  currentGridSize = 10;
  placementMode = false;
  pendingShips = [];

  clearGameSessionStorage();

  SERVER_BASE = "";
  localStorage.removeItem("battleship_server_url");

  document.getElementById("serverUrl").value = "";
  document.getElementById("username").value = "";
  document.getElementById("gameId").value = "";

  updateServerDisplay();
  setServerStatus("Not connected");
  setStatus("Choose a server to connect.");

  const gamesList = document.getElementById("availableGamesList");
  if (gamesList) {
    gamesList.innerHTML = `<p class="empty-games">No games loaded yet.</p>`;
  }

  const historyList = document.getElementById("moveHistoryList");
  if (historyList) {
    historyList.innerHTML = `<p class="empty-history">No moves yet.</p>`;
  }

  showLanding();
}

function requireServer() {
  if (!SERVER_BASE) {
    setServerStatus("Not connected to a server.", "error");
    setStatus("Please connect to a server first.");
    return false;
  }
  return true;
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
  closeLobbyModal();
  showLanding();
}

function openCreateGameModal() {
  if (!requireServer()) return;
  document.getElementById("createGameModal").classList.remove("hidden");
}

function closeCreateGameModal() {
  document.getElementById("createGameModal").classList.add("hidden");
}

function openLobbyModal() {
  document.getElementById("lobbyModal").classList.remove("hidden");
}

function closeLobbyModal() {
  document.getElementById("lobbyModal").classList.add("hidden");
}

function enterGameFromLobby() {
  closeLobbyModal();
  showGame();
  refreshGameState();
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    if (currentGameId && SERVER_BASE) {
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
  localStorage.setItem(STORAGE_KEYS.playerId, currentPlayerId ?? "");
  localStorage.setItem(STORAGE_KEYS.gameId, currentGameId ?? "");
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
  if (!currentGameId || !currentPlayerId) return [];
  const raw = localStorage.getItem(placedShipsKey());
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function createPlayer(username) {
  const response = await fetch(`${getApiBase()}/players`, {
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
  if (!requireServer()) return;

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

    const gameRes = await fetch(`${getApiBase()}/games`, {
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

    openLobbyModal();
    startPolling();
    await refreshGameState();
    loadAvailableGames();
  } catch (err) {
    setStatus(err.message || "Error creating game");
  }
}

async function joinGame() {
  if (!requireServer()) return;

  const username = document.getElementById("username").value.trim();
  const gameId = document.getElementById("gameId").value.trim();

  if (!username || !gameId) {
    setStatus("Enter username and game ID");
    return;
  }

  try {
    currentUsername = username;
    currentPlayerId = await createPlayer(username);

    const joinRes = await fetch(`${getApiBase()}/games/${gameId}/join`, {
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
    currentTurnOrder = Number(joinData.turn_order ?? 1);
    saveSession();
    setStatus(`Joined game ${gameId}`);

    openLobbyModal();
    startPolling();
    await refreshGameState();
    loadAvailableGames();
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

function updateLobbyDisplay(game) {
  const status = game.status || "unknown";
  const activePlayers = Number(game.active_players || 0);
  const maxPlayers = Number(game.max_players || 2);

  document.getElementById("lobbyGameId").textContent = currentGameId ?? "-";
  document.getElementById("lobbyPlayerCount").textContent = `${activePlayers} / ${maxPlayers}`;

  let message = "Waiting for another player to join...";
  let canEnter = false;

  if ((status === "waiting_setup" || status === "waiting") && activePlayers < maxPlayers) {
    message = "Waiting for another player to join...";
  } else if ((status === "waiting_setup" || status === "waiting" || status === "active") && activePlayers === maxPlayers) {
    message = "Both players are here. Ready to start ship placement.";
    canEnter = true;
  } else if (status === "playing") {
    message = "Game has started.";
    canEnter = true;
  } else if (status === "finished") {
    message = "Game finished.";
    canEnter = true;
  }

  document.getElementById("lobbyStatusText").textContent = message;
  document.getElementById("enterGameBtn").classList.toggle("hidden", !canEnter);
}

async function refreshGameState(silent = false) {
  if (!currentGameId || !SERVER_BASE) return;

  try {
    const [gameRes, movesRes] = await Promise.all([
      fetch(`${getApiBase()}/games/${currentGameId}`),
      fetch(`${getApiBase()}/games/${currentGameId}/moves`)
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

    updateLobbyDisplay(currentGameData);
    renderGameInfo(currentGameData);
    renderBoards();
    renderMoveHistory(currentGameData.moves);

    // --- PART 1: Win/Loss Detection ---
    if (currentGameData && currentGameData.status === 'finished') {
      showGameResult(currentGameData.winner_id);
    }

  } catch (err) {
    if (!silent) {
      const statusEl = document.getElementById("gameStatusOnly");
      if (statusEl) statusEl.textContent = err.message;
      setStatus(err.message);
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

  if ((status === "waiting_setup" || status === "waiting") && activePlayers < maxPlayers) {
    message = "Waiting for another player to join...";
  } else if ((status === "waiting_setup" || status === "waiting" || status === "active") && activePlayers === maxPlayers) {
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

  const canPlaceNow =
    (status === "waiting_setup" || status === "waiting" || status === "active") &&
    activePlayers === maxPlayers;

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
  if (!currentGameId || !currentPlayerId || !SERVER_BASE) return;

  if (pendingShips.length !== 3) {
    document.getElementById("gameStatusOnly").textContent = "Select exactly 3 ship cells.";
    return;
  }

  try {
    const response = await fetch(`${getApiBase()}/games/${currentGameId}/place`, {
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

function cellAlreadyTargetedByYou(row, col) {
  const moves = currentGameData?.moves || [];
  return moves.some(
    (move) =>
      Number(move.player_id) === Number(currentPlayerId) &&
      Number(move.row) === Number(row) &&
      Number(move.col) === Number(col)
  );
}

async function fireShot(row, col) {
  if (!currentGameId || !currentPlayerId || !SERVER_BASE) return;

  if (cellAlreadyTargetedByYou(row, col)) {
    document.getElementById("gameStatusOnly").textContent = "You already fired at that cell.";
    return;
  }

  try {
    const response = await fetch(`${getApiBase()}/games/${currentGameId}/fire`, {
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

      const enemyCell = getCell("enemyBoard", row, col);
      if (enemyCell) {
        enemyCell.classList.remove("targetable");
        enemyCell.classList.add("disabled-target");
      }
    } else {
      markCell("playerBoard", row, col, resultClass);
    }
  }
}

window.addEventListener("load", () => {
  loadSession();

  if (SERVER_BASE) {
    document.getElementById("serverUrl").value = SERVER_BASE;
    updateServerDisplay();
    setServerStatus("Previously connected server loaded.", "success");
    loadAvailableGames();
  } else {
    updateServerDisplay();
    setServerStatus("Not connected");
  }
});