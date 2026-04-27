/* ---------------- S.S. GPT DYNAMIC SERVER DETECTION ---------------- */
const host = window.location.hostname;

const TEAM_SERVERS = {
    christian: "https://cpsc-3750-battleship-final-project-phase2-3zol.onrender.com",
    anthony: "https://cpsc-3750-battleship-final-project-phase2.onrender.com"
};

// Default choice
let default_choice = TEAM_SERVERS.christian;

// If it's Anthony's site, swap to his server
if (host.includes('anthonyfrialde')) {
    default_choice = TEAM_SERVERS.anthony;
} 
// If it's your custom domain, it stays as christian
else if (host.includes('christianjohnston.dev')) {
    default_choice = TEAM_SERVERS.christian;
}

let SERVER_BASE = localStorage.getItem("battleship_server_url") || default_choice;

let playerNamesCache = {};
let currentPlayerId = null;
let currentGameId = null;
let currentUsername = "";
let currentGameData = null;
let currentTurnOrder = null;
let currentGridSize = 10;
let pollInterval = null;
let selectedOpponentId = null;

let placementMode = false;
let pendingShips = [];

const SHIP_LOADOUT = [5, 4, 3];
let selectedShipIndex = 0;
let shipDirection = "horizontal";
let placedShipIndexes = new Set();

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

function clearServerInput() {
  const input = document.getElementById("serverUrl");
  if (input) input.value = "";

  SERVER_BASE = "";
  localStorage.removeItem("battleship_server_url");

  updateServerDisplay();
  setServerStatus("Server cleared");
}

function toggleServerList() {
  const panel = document.getElementById("serverListPanel");
  if (!panel) return;
  panel.classList.toggle("hidden");
}

function selectServerFromList(url) {
  const input = document.getElementById("serverUrl");
  if (input) input.value = url;

  const panel = document.getElementById("serverListPanel");
  if (panel) panel.classList.add("hidden");

  setServerStatus("Server selected. Click Connect.", "success");
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

    // --- NEW LOGIC: POPULATE CACHE ---
    games.forEach(game => {
      // Some servers use .players, some use .participants
      const playersInGame = game.players || game.participants || [];
      playersInGame.forEach(p => {
        if (p.player_id && p.username) {
          playerNamesCache[p.player_id] = p.username;
        }
      });
    });
    // ---------------------------------

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

      const timestampValue =
        move.timestamp || move.created_at || move.move_time || move.move_timestamp;
      const formattedTimestamp = formatMoveTimestamp(timestampValue);

      return `
        <div class="move-history-item">
          <div class="move-history-main">
            <div class="move-history-shot">
              ${playerLabel} fired at (${row}, ${col})
            </div>

            <div class="move-history-meta">
              Move #${sortedMoves.length - index}
              ${formattedTimestamp ? ` <span class="move-timestamp">${formattedTimestamp}</span>` : ""}
            </div>
          </div>

          <div class="move-result ${result}">
            ${result.toUpperCase()}
          </div>
        </div>
      `;
    })
    .join("");
}

/* ---------------- STATS HELPERS ---------------- */

function renderCareerStats(stats) {
  const card = document.getElementById("careerStatsCard");
  if (!card) return;

  const usernameEl = document.getElementById("careerUsername");
  const gamesEl = document.getElementById("careerGames");
  const winsEl = document.getElementById("careerWins");
  const lossesEl = document.getElementById("careerLosses");
  const shotsEl = document.getElementById("careerShots");
  const hitsEl = document.getElementById("careerHits");
  const accuracyEl = document.getElementById("careerAccuracy");

  if (usernameEl) usernameEl.textContent = stats.username ?? currentUsername ?? "Player";
  if (gamesEl) gamesEl.textContent = Number(stats.games_played || 0);
  if (winsEl) winsEl.textContent = Number(stats.wins || 0);
  if (lossesEl) lossesEl.textContent = Number(stats.losses || 0);
  if (shotsEl) shotsEl.textContent = Number(stats.total_shots || 0);
  if (hitsEl) hitsEl.textContent = Number(stats.total_hits || 0);
  if (accuracyEl) accuracyEl.textContent = `${Number(stats.accuracy || 0).toFixed(2)}%`;

  card.classList.remove("hidden");
}

function hideCareerStats() {
  const card = document.getElementById("careerStatsCard");
  if (card) card.classList.add("hidden");
}

function renderLiveGameStats(stats) {
  const card = document.getElementById("liveGameStatsCard");
  if (!card) return;

  const shotsEl = document.getElementById("liveShots");
  const hitsEl = document.getElementById("liveHits");
  const missesEl = document.getElementById("liveMisses");
  const accuracyEl = document.getElementById("liveAccuracy");
  const shipsEl = document.getElementById("liveShipsRemaining");

  if (shotsEl) shotsEl.textContent = Number(stats.shots_fired || 0);
  if (hitsEl) hitsEl.textContent = Number(stats.hits || 0);
  if (missesEl) missesEl.textContent = Number(stats.misses || 0);
  if (accuracyEl) accuracyEl.textContent = `${Number(stats.accuracy || 0).toFixed(2)}%`;
  if (shipsEl) shipsEl.textContent = Number(stats.ships_remaining || 0);

  card.classList.remove("hidden");
}

function clearLiveGameStats() {
  const card = document.getElementById("liveGameStatsCard");
  if (card) card.classList.add("hidden");

  const shotsEl = document.getElementById("liveShots");
  const hitsEl = document.getElementById("liveHits");
  const missesEl = document.getElementById("liveMisses");
  const accuracyEl = document.getElementById("liveAccuracy");
  const shipsEl = document.getElementById("liveShipsRemaining");

  if (shotsEl) shotsEl.textContent = "0";
  if (hitsEl) hitsEl.textContent = "0";
  if (missesEl) missesEl.textContent = "0";
  if (accuracyEl) accuracyEl.textContent = "0.00%";
  if (shipsEl) shipsEl.textContent = "0";
}

async function loadCareerStats() {
  if (!currentPlayerId || !SERVER_BASE) return null;

  try {
    const res = await fetch(`${getApiBase()}/players/${currentPlayerId}/stats`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to load career stats");
    }

    renderCareerStats(data);
    return data;
  } catch (err) {
    console.error("loadCareerStats error:", err);
    return null;
  }
}

async function loadLiveGameStats() {
  if (!currentPlayerId || !currentGameId || !SERVER_BASE) return null;

  try {
    const res = await fetch(`${getApiBase()}/games/${currentGameId}/stats/${currentPlayerId}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || "Failed to load current game stats");
    }

    renderLiveGameStats(data);
    return data;
  } catch (err) {
    console.error("loadLiveGameStats error:", err);
    return null;
  }
}

async function connectToServer() {
  const input = document.getElementById("serverUrl").value.trim();

  if (!input) {
    setServerStatus("Please enter a server URL.", "error");
    return;
  }

  setServerStatus("Checking connection...");

  const cleaned = input.replace(/\/+$/, "");

  try {
     const testRes = await fetch(`${cleaned}/api`);
     if (!testRes.ok) throw new Error("Connection failed");

     SERVER_BASE = cleaned;

     localStorage.setItem("battleship_server_url", SERVER_BASE);

     updateServerDisplay();
     setServerStatus("Connected ✓", "success");

     loadAvailableGames();

  } catch(err) {
     setServerStatus("Connection failed", "error");
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

  const overlay = document.getElementById("gameResultOverlay");
  if (overlay) overlay.classList.add("hidden");

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

  clearLiveGameStats();
  hideCareerStats();

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

  const overlay = document.getElementById("gameResultOverlay");
  if (overlay) overlay.classList.add("hidden");

  // clear current game session
  currentGameId = null;
  currentGameData = null;
  currentTurnOrder = null;
  placementMode = false;
  pendingShips = [];

  localStorage.removeItem(STORAGE_KEYS.gameId);
  localStorage.removeItem(STORAGE_KEYS.turnOrder);

  clearLiveGameStats();

  // rebuild clean lobby state
  loadAvailableGames();
  showLanding();

  setStatus("Returned to lobby.");
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

  return data;
}

async function createGameFromModal() {
  if (!requireServer()) return;

  const username = document.getElementById("username").value.trim();
  const gridSize = Number(document.getElementById("gridSizeSelect").value);
  let maxPlayers = Number(document.getElementById("maxPlayersInput").value);

  if (maxPlayers < 1) {
	setStatus("Max players must be at least 1");
	return;
  }

  if (maxPlayers > 100){
	setStatus("Max players must be less than 100");
	return;
  }

  if (!maxPlayers || maxPlayers < 1){
	maxPlayers = 2;
  }

  if (!username) {
    setStatus("Enter a username first");
    return;
  }

  try {
    currentUsername = username;
    const playerData = await createPlayer(username);
    currentPlayerId = Number(playerData.player_id);
    currentUsername = playerData.username || username;
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
    await refreshPlayerNamesCache();
    saveSession();
    showAccountHeader(currentUsername);
    await loadCareerStats();
    await loadLiveGameStats();

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
    const playerData = await createPlayer(username);
    currentPlayerId = Number(playerData.player_id);
    currentUsername = playerData.username || username;

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
    await refreshPlayerNamesCache();
    currentTurnOrder = Number(joinData.turn_order);
    saveSession();
    showAccountHeader(currentUsername);
    await loadCareerStats();
    await loadLiveGameStats();

    setStatus(`Joined game ${gameId}`);

    openLobbyModal();
    startPolling();
    await refreshGameState();
    loadAvailableGames();
  } catch (err) {
    setStatus(err.message || "Error joining game");
  }
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
      cell.classList.add(
        elementId === "enemyBoard" || elementId === "targetBoard"
          ? "targetable"
          : "placeable"
      );

      cell.addEventListener("click", () => onCellClick(row, col));

      if (elementId === "playerBoard") {
        cell.addEventListener("mouseenter", () => showShipPreview(row, col));
        cell.addEventListener("mouseleave", clearShipPreview);
      }
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
    message = "All players are here. Ready to start ship placement.";
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
      fetch(`${getApiBase()}/games/${currentGameId}`, { cache: "no-store" }),
      fetch(`${getApiBase()}/games/${currentGameId}/moves`, { cache: "no-store" })
    ]);

    const game = await gameRes.json();
    const moves = await movesRes.json();

    if (!gameRes.ok) {
      throw new Error(game.message || game.error || "Could not load game");
    }

    if (!movesRes.ok) {
      throw new Error(moves.message || moves.error || "Could not load moves");
    }

    // Cache usernames
    if (Array.isArray(game.players)) {
      game.players.forEach(p => {
        if (p.player_id && p.username) {
          playerNamesCache[p.player_id] = p.username;
        }
      });
    }

    // Normalize server data
    currentGameData = {
      ...game,
      participants: Array.isArray(game.players) ? game.players : [],
      moves: Array.isArray(moves) ? moves : []
    };

    const me = currentGameData.participants.find(
      (p) => Number(p.player_id) === Number(currentPlayerId)
    );

    if (me && me.turn_order !== undefined && me.turn_order !== null) {
      currentTurnOrder = Number(me.turn_order);
      localStorage.setItem(STORAGE_KEYS.turnOrder, currentTurnOrder);
    }

    currentGridSize = Number(game.grid_size || currentGridSize || 10);
    saveSession();

    // UI updates
    updateLobbyDisplay(currentGameData);

    if (currentGameData.participants.length > 0) {
      updateOpponentDropdown(currentGameData.participants);
    }

    renderGameInfo(currentGameData);
    renderBoards();
    renderMoveHistory(currentGameData.moves);

    await loadCareerStats();

    if (
      currentGameData.status === "playing" ||
      currentGameData.status === "finished"
    ) {
      await loadLiveGameStats();
    } else {
      clearLiveGameStats();
    }

    if (currentGameData.status === "finished") {
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
  const maxPlayers = Number(game.max_players || 2);
  const currentTurnIndex = Number(game.current_turn_index ?? -1);

  const totalShipCells = SHIP_LOADOUT.reduce((sum, size) => sum + size, 0);
  const placed = loadPlacedShips();
  const hasPlaced = placed.length === totalShipCells;

  document.getElementById("yourBoardLabel").textContent = `${currentUsername}'s Board`;
  document.getElementById("enemyBoardLabel").textContent = "Opponent Board";

  let message = `Game status: ${status} | Players: ${activePlayers}/${maxPlayers}`;

  if ((status === "waiting_setup" || status === "waiting") && activePlayers < maxPlayers) {
    message = "Waiting for another player to join...";
  } else if (
    (status === "waiting_setup" || status === "waiting" || status === "active") &&
    activePlayers === maxPlayers
  ) {
    message = hasPlaced
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

  document.getElementById("startPlacementBtn").classList.toggle(
    "hidden",
    !canPlaceNow || hasPlaced || placementMode
  );

  document.getElementById("submitPlacementBtn").classList.toggle("hidden", !placementMode);
  document.getElementById("clearPlacementBtn").classList.toggle("hidden", !placementMode);

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

function updateShipSelectorUI() {
  document.querySelectorAll(".ship-choice").forEach((btn, index) => {
    btn.classList.toggle("active", index === selectedShipIndex);
    btn.disabled = placedShipIndexes.has(index);
  });

  const text = document.getElementById("shipPlacementText");
  if (text) {
    text.textContent = `Selected: ${SHIP_LOADOUT[selectedShipIndex]} x 1 (${shipDirection})`;
  }
}

function selectShipToPlace(index) {
  if (placedShipIndexes.has(index)) return;
  selectedShipIndex = index;
  updateShipSelectorUI();
}

function rotateShipPlacement() {
  shipDirection = shipDirection === "horizontal" ? "vertical" : "horizontal";
  clearShipPreview();
  updateShipSelectorUI();
}

function enablePlacementMode() {
  placementMode = true;
  pendingShips = [];
  placedShipIndexes = new Set();
  selectedShipIndex = 0;
  shipDirection = "horizontal";

  document.getElementById("shipSelectorPanel").classList.remove("hidden");

  updateShipSelectorUI();
  renderBoards();
}

function clearPlacementSelection() {
  pendingShips = [];
  placedShipIndexes = new Set();
  selectedShipIndex = 0;
  shipDirection = "horizontal";

  updateShipSelectorUI();
  renderBoards();
}

function getPreviewCells(row, col) {
  const shipLength = SHIP_LOADOUT[selectedShipIndex];
  const cells = [];

  for (let i = 0; i < shipLength; i++) {
    const shipRow = shipDirection === "vertical" ? row + i : row;
    const shipCol = shipDirection === "horizontal" ? col + i : col;

    cells.push({ row: shipRow, col: shipCol });
  }

  return cells;
}

function isValidShipPlacement(cells) {
  return cells.every((cell) => {
    const inBounds =
      cell.row >= 0 &&
      cell.row < currentGridSize &&
      cell.col >= 0 &&
      cell.col < currentGridSize;

    const overlaps = pendingShips.some(
      (s) => Number(s.row) === cell.row && Number(s.col) === cell.col
    );

    return inBounds && !overlaps;
  });
}

function showShipPreview(row, col) {
  if (!placementMode || placedShipIndexes.has(selectedShipIndex)) return;

  clearShipPreview();

  const cells = getPreviewCells(row, col);
  const valid = isValidShipPlacement(cells);

  cells.forEach((cell) => {
    const el = getCell("playerBoard", cell.row, cell.col);
    if (el) {
      el.classList.add(valid ? "preview-valid" : "preview-invalid");
    }
  });
}

function clearShipPreview() {
  document.querySelectorAll(".preview-valid, .preview-invalid").forEach((cell) => {
    cell.classList.remove("preview-valid", "preview-invalid");
  });
}

function togglePendingShip(row, col) {
  if (placedShipIndexes.size === SHIP_LOADOUT.length) {
    document.getElementById("gameStatusOnly").textContent =
      "All ships placed. Click Confirm Placement.";
    return;
  }

  const shipLength = SHIP_LOADOUT[selectedShipIndex];

  if (placedShipIndexes.has(selectedShipIndex)) return;

  const newCells = [];

  for (let i = 0; i < shipLength; i++) {
    const shipRow = shipDirection === "vertical" ? row + i : row;
    const shipCol = shipDirection === "horizontal" ? col + i : col;

    if (
      shipRow < 0 ||
      shipRow >= currentGridSize ||
      shipCol < 0 ||
      shipCol >= currentGridSize
    ) {
      document.getElementById("gameStatusOnly").textContent =
        "Ship does not fit there.";
      return;
    }

    const overlaps = pendingShips.some(
      (s) => Number(s.row) === shipRow && Number(s.col) === shipCol
    );

    if (overlaps) {
      document.getElementById("gameStatusOnly").textContent =
        "Ships cannot overlap.";
      return;
    }

    newCells.push({
      row: shipRow,
      col: shipCol,
      ship_size: shipLength
    });
  }

  pendingShips.push(...newCells);
  placedShipIndexes.add(selectedShipIndex);

  const nextIndex = SHIP_LOADOUT.findIndex((_, index) => !placedShipIndexes.has(index));

  if (nextIndex !== -1) {
    selectedShipIndex = nextIndex;
  } else {
    document.getElementById("gameStatusOnly").textContent =
      "All ships placed. Click Confirm Placement.";
  }

  updateShipSelectorUI();
  renderBoards();
}

async function submitPlacedShips() {
  if (!currentGameId || !currentPlayerId || !SERVER_BASE) return;

  const totalShipCells = SHIP_LOADOUT.reduce((sum, size) => sum + size, 0);

  if (pendingShips.length !== totalShipCells) {
    document.getElementById("gameStatusOnly").textContent =
      `Place all ships first. Selected ${pendingShips.length}/${totalShipCells} cells.`;
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
    placedShipIndexes = new Set();

    document.getElementById("shipSelectorPanel").classList.add("hidden");
    document.getElementById("submitPlacementBtn").classList.add("hidden");
    document.getElementById("clearPlacementBtn").classList.add("hidden");

    document.getElementById("gameStatusOnly").textContent =
      "Ships placed. Waiting for other player(s)...";

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

// Update the parameters to include targetId
async function fireShot(row, col, targetId) {
  if (!currentGameId || !currentPlayerId || !SERVER_BASE) return;

  // 1. Validation: Ensure we have a target
  if (!targetId) {
    setStatus("Error: No target player selected.");
    return;
  }

  try {
    // 2. API Call: Send the target_id to the server
    const response = await fetch(`${getApiBase()}/games/${currentGameId}/fire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: currentPlayerId,
        target_id: targetId, // This is the new crucial line
        row,
        col
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Shot failed");
    }

    // 3. Feedback: Let the user know what happened
    setStatus(`Shot at ${targetId}: ${data.result}`);

    // 4. Refresh: Update all boards to show the new hit/miss
    await refreshGameState();
  } catch (err) {
    setStatus(err.message);
  }
}

function confirmForfeitMatch() {
  const confirmed = confirm(
    "Are you sure you want to leave this match? This will count as a loss."
  );

  if (!confirmed) return;

  forfeitMatch();
}

async function forfeitMatch() {
  if (!currentGameId || !currentPlayerId || !SERVER_BASE) {
    goHome();
    return;
  }

  try {
    const res = await fetch(`${getApiBase()}/games/${currentGameId}/forfeit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: currentPlayerId })
    });

    const text = await res.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || "Server returned non-JSON response");
    }

    if (!res.ok) {
      throw new Error(data.message || data.error || "Could not forfeit match");
    }

    currentGameData = {
      ...(currentGameData || {}),
      status: "finished",
      winner_id: data.winner_id,
      ended_by_forfeit: true
    };

    showGameResult(data.winner_id);
  } catch (err) {
    document.getElementById("gameStatusOnly").textContent = err.message;
  }
}
async function showGameResult(winnerId) {
  if (winnerId == null) return;

  stopPolling();

  const overlay = document.getElementById("gameResultOverlay");
  const victoryMsg = document.getElementById("victoryMessage");
  const defeatMsg = document.getElementById("defeatMessage");
  const statsBox = document.getElementById("resultStats");
  const victorySubtitle = document.getElementById("victorySubtitle");

  const isWinner = Number(winnerId) === Number(currentPlayerId);

  if (victorySubtitle) {
    if (currentGameData?.ended_by_forfeit && isWinner) {
      victorySubtitle.textContent = "Opponent forfeited";
    } else if (currentGameData?.ended_by_forfeit && !isWinner) {
      victorySubtitle.textContent = "You forfeited";
    } else {
      victorySubtitle.textContent = "Enemy fleet neutralized";
    }
  }

  if (isWinner) {
    victoryMsg.classList.remove("hidden");
    defeatMsg.classList.add("hidden");
  } else {
    defeatMsg.classList.remove("hidden");
    victoryMsg.classList.add("hidden");
  }

  if (statsBox) statsBox.classList.add("hidden");
  resetResultStatsDisplay();

  overlay.classList.remove("hidden");

  await loadResultStats();
}

function renderBoards() {
  if (!currentGameData) return;

  const participants = Array.isArray(currentGameData.participants)
    ? currentGameData.participants
    : [];

  const moves = Array.isArray(currentGameData.moves)
    ? currentGameData.moves
    : [];

  // 1. Pick a default target if none selected
  if (!selectedOpponentId && participants.length > 0) {
    const validOpponent =
      participants.find(
        (p) => Number(p.player_id) !== Number(currentPlayerId) && !p.is_eliminated
      ) ||
      participants.find((p) => Number(p.player_id) !== Number(currentPlayerId));

    if (validOpponent) {
      selectedOpponentId = Number(validOpponent.player_id);
    }
  }

  // 2. Render your own board
  buildBoard("playerBoard", placementMode, (r, c) => {
    if (placementMode) togglePendingShip(r, c);
  });

  const savedShips = typeof loadPlacedShips === "function" ? loadPlacedShips() : [];
  savedShips.forEach((s) =>
    markCell("playerBoard", Number(s.row), Number(s.col), "ship")
  );

  if (placementMode && Array.isArray(pendingShips)) {
    pendingShips.forEach((s) =>
      markCell("playerBoard", Number(s.row), Number(s.col), "pending-ship")
    );
  }

  // Show all shots fired at you
  const shotsAtMe = moves.filter(
    (m) => Number(m.target_id) === Number(currentPlayerId)
  );

  shotsAtMe.forEach((m) => {
    const moveResult =
      m.result === "hit" || m.hit === true || String(m.hit) === "true"
        ? "hit"
        : "miss";

    markCell("playerBoard", Number(m.row), Number(m.col), moveResult);
  });

  // 3. Render target board
  const isMyTurn =
    Number(currentTurnOrder) === Number(currentGameData.current_turn_index);

  const canFire =
    currentGameData.status === "playing" && isMyTurn && selectedOpponentId;

  buildBoard("targetBoard", canFire, (r, c) => {
    if (canFire && selectedOpponentId) {
      fireShot(r, c, selectedOpponentId);
    }
  });

  // 4. Update target label
  const opponentLabel = document.getElementById("enemyBoardLabel");

  if (selectedOpponentId && opponentLabel) {
    const selectedOpponent = participants.find(
      (p) => Number(p.player_id) === Number(selectedOpponentId)
    );

    const displayName =
      selectedOpponent?.username ||
      playerNamesCache[selectedOpponentId] ||
      `Player ${selectedOpponentId}`;

    const isSunk =
      selectedOpponent &&
      (selectedOpponent.is_eliminated ||
        Number(selectedOpponent.ships_remaining) === 0);

    const statusText = currentGameData.status === "playing" && isSunk ? " (SUNK)" : "";

    opponentLabel.textContent = `Targeting: ${displayName}${statusText}`;
  }

  // 5. Show ALL shots fired at selected target, not just your own
  if (selectedOpponentId) {
    const shotsAtSelectedTarget = moves.filter(
      (m) => Number(m.target_id) === Number(selectedOpponentId)
    );

    shotsAtSelectedTarget.forEach((m) => {
      const moveResult =
        m.result === "hit" || m.hit === true || String(m.hit) === "true"
          ? "hit"
          : "miss";

      markCell("targetBoard", Number(m.row), Number(m.col), moveResult);

      const cell = getCell("targetBoard", Number(m.row), Number(m.col));

      if (cell) {
        cell.classList.add("disabled-target");

        if (Number(m.player_id) !== Number(currentPlayerId)) {
          cell.classList.add("other-player-shot");
        }
      }
    });
  }
}

window.addEventListener("load", async () => {
  loadSession();

  if (SERVER_BASE) {
    document.getElementById("serverUrl").value = SERVER_BASE;
    updateServerDisplay();
    setServerStatus("Previously connected server loaded.", "success");
    showAccountHeader(currentUsername);
    await loadCareerStats();
    loadAvailableGames();
  } else {
    updateServerDisplay();
    setServerStatus("Not connected");
  }

  const exitBtn = document.getElementById("exitGameBtn");
  if (exitBtn) {
    exitBtn.replaceWith(exitBtn.cloneNode(true)); // Clear old listeners
    const newExitBtn = document.getElementById("exitGameBtn");
    newExitBtn.addEventListener("click", () => {
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = null;

      const overlay = document.getElementById("gameResultOverlay");
      if (overlay) overlay.classList.add("hidden");

      currentGameId = null;
      currentGameData = null;
      selectedOpponentId = null; // Reset this!
      placementMode = false;
      pendingShips = [];

      localStorage.removeItem(STORAGE_KEYS.gameId);
      localStorage.removeItem(STORAGE_KEYS.turnOrder);

      clearLiveGameStats();
      showLanding(); // Ensure this function correctly toggles #landingView vs #gameView
      loadAvailableGames();
    });
  }
});

function animateNumber(element, endValue, suffix = "", duration = 900) {
  if (!element) return;

  const startValue = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(startValue + (endValue - startValue) * easedProgress);

    element.textContent = `${currentValue}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function resetResultStatsDisplay() {
  const accuracyEl = document.getElementById("resultAccuracy");
  const hitsEl = document.getElementById("resultHits");
  const missesEl = document.getElementById("resultMisses");

  if (accuracyEl) accuracyEl.textContent = "0%";
  if (hitsEl) hitsEl.textContent = "0";
  if (missesEl) missesEl.textContent = "0";
}

async function loadResultStats() {
  if (!currentPlayerId || !currentGameId || !SERVER_BASE) return;

  try {
    const res = await fetch(
      `${getApiBase()}/games/${currentGameId}/stats/${currentPlayerId}`
    );
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Failed to load game stats");

    const hits = Number(data.hits || 0);
    const misses = Number(data.misses || 0);
    const accuracy = Number(data.accuracy || 0);

    const accuracyEl = document.getElementById("resultAccuracy");
    const hitsEl = document.getElementById("resultHits");
    const missesEl = document.getElementById("resultMisses");
    const statsBox = document.getElementById("resultStats");

    resetResultStatsDisplay();
    if (statsBox) statsBox.classList.remove("hidden");

    animateNumber(accuracyEl, Math.round(accuracy), "%", 1000);
    animateNumber(hitsEl, hits, "", 900);
    animateNumber(missesEl, misses, "", 900);
  } catch (err) {
    console.error("Game result stats load failed:", err);
  }
}

function applyTheme(theme) {
  const body = document.body;
  const themeImg = document.getElementById("themeIcon");

  if (theme === "light") {
    body.classList.add("light-mode");
    // Show moon icon when in light mode (to suggest switching to dark)
    if (themeImg) themeImg.src = "moon.png";
  } else {
    body.classList.remove("light-mode");
    // Show sun icon when in dark mode
    if (themeImg) themeImg.src = "sun.png";
  }

  localStorage.setItem("theme", theme);
}

function toggleTheme() {
  const isLight = document.body.classList.contains("light-mode");
  applyTheme(isLight ? "dark" : "light");
}

document.addEventListener("DOMContentLoaded", async () => {
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  const savedUser = localStorage.getItem(STORAGE_KEYS.username);
  if (savedUser && SERVER_BASE) {
    currentUsername = savedUser;
    currentPlayerId = Number(localStorage.getItem(STORAGE_KEYS.playerId));
    showAccountHeader(currentUsername);
    updateServerDisplay();
    await loadCareerStats();
    loadAvailableGames();
  }
});

function showAccountHeader(username) {
  const profileDiv = document.getElementById("userProfile");
  const nameSpan = document.getElementById("displayUsername");

  if (profileDiv && nameSpan) {
    nameSpan.textContent = username;
    profileDiv.classList.remove("hidden");
  }
}

function toggleHowToPlay() {
  const overlay = document.getElementById("howToPlayOverlay");
  overlay.classList.toggle("hidden");
}

// Optional: Close modal if user clicks on the dimmed background area
const howToPlayOverlay = document.getElementById("howToPlayOverlay");

if (howToPlayOverlay) {
  howToPlayOverlay.addEventListener("click", (e) => {
    if (e.target.id === "howToPlayOverlay") {
      toggleHowToPlay();
    }
  });
}

// Function to show/hide the server modal
function toggleServerModal() {
  const modal = document.getElementById("serverModal");
  modal.classList.toggle("hidden");
}

// Wrapper to close modal after successful connection
async function connectAndClose() {
  const wasConnected = await connectToServer();
  // If connectToServer returns true on success, close the modal
  const statusEl = document.getElementById("serverConnectionStatus");
  if (statusEl.classList.contains("success")) {
    toggleServerModal();
  }
}

// Close modal if user clicks the dimmed background
window.onclick = function(event) {
  const serverModal = document.getElementById("serverModal");
  const helpModal = document.getElementById("howToPlayOverlay");
  
  if (event.target == serverModal) {
    toggleServerModal();
  } else if (event.target == helpModal) {
    toggleHowToPlay();
  }
}

document.getElementById("exitGameBtn").addEventListener("click", () => {
  // 1. Stop polling the server for game updates
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  // 2. Clear game-specific variables
  currentGameId = null;
  currentGameData = null;
  currentTurnOrder = null;

  // 3. Remove game ID from local storage so it doesn't auto-rejoin on refresh
  localStorage.removeItem(STORAGE_KEYS.gameId);

  // 4. Reset the UI: Hide the game screen and result screen, show the lobby
  document.getElementById("gameScreen").classList.add("hidden");
  document.getElementById("resultScreen").classList.add("hidden");
  document.getElementById("lobbyScreen").classList.remove("hidden");

  // 5. Refresh the list of available games
  loadAvailableGames();
  
  // Optional: Reset status message
  setStatus("Returned to lobby");
});

function updateTurnDisplay(gameState) {
  const indicator = document.getElementById("turnIndicator");
  indicator.classList.remove("waiting", "your-turn", "opponent-turn");

  const activePlayer = gameState.participants.find(p => p.player_id === gameState.current_turn_id);
  const isMyTurn = gameState.current_turn_id === currentPlayerId;

  if (gameState.status === "waiting") {
    indicator.classList.add("waiting");
    indicator.textContent = `Waiting for players (${gameState.participants.length}/X)...`;
  } else if (isMyTurn) {
    indicator.classList.add("your-turn");
    indicator.textContent = "YOUR TURN";
  } else {
    indicator.classList.add("opponent-turn");
    indicator.textContent = `TURN: ${activePlayer.username}`;
  }
}

document.addEventListener("keydown", (event) => {
  if (!placementMode) return;

  if (event.key.toLowerCase() === "r") {
    rotateShipPlacement();
  }
});

function changeSelectedOpponent() {
  const select = document.getElementById("opponentSelect");
  if (!select) return;
  
  // Update the global ID variable
  selectedOpponentId = select.value ? Number(select.value) : null;
  
  // Immediately redraw the boards to show the new target
  renderBoards();
}

function updateOpponentDropdown(participants) {
  const select = document.getElementById("opponentSelect");
  if (!select) return;

  const players = Array.isArray(participants) ? participants : [];
  // Filter out yourself
  const opponents = players.filter(p => Number(p.player_id) !== Number(currentPlayerId));

  if (opponents.length === 0) {
    select.innerHTML = '<option value="">No targets available</option>';
    selectedOpponentId = null;
    return;
  }

  // Ensure we have a selection if none exists
  if (selectedOpponentId === null || !opponents.some(opp => Number(opp.player_id) === Number(selectedOpponentId))) {
    selectedOpponentId = Number(opponents[0].player_id);
  }

  const optionsHtml = opponents.map(opp => {
    const oppId = Number(opp.player_id);

    // If we don't know this person yet, try a quick cache refresh in the background
    if (!playerNamesCache[oppId] && !opp.username) {
    refreshPlayerNamesCache(); 
    }
    
    // Check our cache for the name, otherwise fallback to "Player ID"
    const displayName = opp.username || playerNamesCache[oppId] || `Player ${oppId}`;
    
    const isSelected = oppId === selectedOpponentId;
    
    // Only show (SUNK) if game is playing and they have 0 ships
    const isSunk = currentGameData?.status === "playing" && 
                   (opp.is_eliminated || opp.ships_remaining === 0);
    const sunkText = isSunk ? ' (SUNK)' : '';

    return `<option value="${oppId}" ${isSelected ? 'selected' : ''}>
      ${displayName}${sunkText}
    </option>`;
  }).join("");

  if (select.innerHTML !== optionsHtml) {
    select.innerHTML = optionsHtml;
  }
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function refreshPlayerNamesCache() {
  if (!requireServer()) return;

  try {
    const response = await fetch(`${getApiBase()}/players`);
    const players = await response.json();

    if (response.ok && Array.isArray(players)) {
      players.forEach(p => {
        if (p.player_id && p.username) {
          playerNamesCache[p.player_id] = p.username;
        }
      });
      // After updating the cache, redraw the boards to replace "Player ID" with names
      renderBoards();
    }
  } catch (err) {
    console.error("Failed to fetch player names:", err);
  }
}