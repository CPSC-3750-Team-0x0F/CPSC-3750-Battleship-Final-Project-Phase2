const STORAGE_KEYS = {
  serverUrl: "battleship_server_url",
  username: "battleship_username",
  playerId: "battleship_player_id",
  gameId: "battleship_game_id",
  targetPlayerId: "battleship_target_player_id"
};

const state = {
  serverUrl: "",
  username: "",
  playerId: null,
  gameId: null,
  gridSize: 10,
  game: null,
  stats: null,
  ownBoard: [],
  targetBoard: [],
  selectedPlacement: [],
  selectedTargetPlayerId: null,
  pollTimer: null
};

function getApiBase() {
  return state.serverUrl.replace(/\/$/, "");
}

function saveServerUrl() {
  const value = document.getElementById("serverUrl").value.trim();

  if (!value) {
    alert("Enter a server URL first.");
    return;
  }

  state.serverUrl = value;
  localStorage.setItem(STORAGE_KEYS.serverUrl, value);
  renderSavedSession();
  alert("Server URL saved.");
}

function loadSavedIdentity() {
  state.serverUrl = localStorage.getItem(STORAGE_KEYS.serverUrl) || "";
  state.username = localStorage.getItem(STORAGE_KEYS.username) || "";
  state.playerId = Number(localStorage.getItem(STORAGE_KEYS.playerId)) || null;
  state.gameId = Number(localStorage.getItem(STORAGE_KEYS.gameId)) || null;
  state.selectedTargetPlayerId =
    Number(localStorage.getItem(STORAGE_KEYS.targetPlayerId)) || null;

  document.getElementById("serverUrl").value = state.serverUrl;
  document.getElementById("username").value = state.username;

  renderSavedSession();
}

function renderSavedSession() {
  const parts = [
    state.serverUrl ? `Server: ${state.serverUrl}` : "Server not set",
    state.username ? `Username: ${state.username}` : "Username not set",
    state.playerId ? `Player ID: ${state.playerId}` : "Player not created",
    state.gameId ? `Saved Game ID: ${state.gameId}` : "No saved game"
  ];

  document.getElementById("savedSessionText").textContent = parts.join(" • ");
}

async function api(path, options = {}) {
  const base = getApiBase();

  if (!base) {
    throw new Error("Set the server URL first.");
  }

  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || data.error || JSON.stringify(data) || "Request failed");
  }

  return data;
}

async function createPlayer() {
  const username = document.getElementById("username").value.trim();

  if (!username) {
    alert("Enter a username first.");
    return;
  }

  try {
    const data = await api("/players", {
      method: "POST",
      body: JSON.stringify({ username })
    });

    state.username = username;
    state.playerId = data.player_id;

    localStorage.setItem(STORAGE_KEYS.username, username);
    localStorage.setItem(STORAGE_KEYS.playerId, String(data.player_id));

    renderSavedSession();
    alert(`Player created. ID: ${data.player_id}`);
  } catch (error) {
    alert(error.message);
  }
}

async function createGame() {
  if (!state.playerId) {
    alert("Create or load a player first.");
    return;
  }

  const grid_size = Number(document.getElementById("createGridSize").value);

  try {
    const data = await api("/games", {
      method: "POST",
      body: JSON.stringify({
        player_id: state.playerId,
        grid_size
      })
    });

    state.gameId = data.game_id;
    state.gridSize = grid_size;
    localStorage.setItem(STORAGE_KEYS.gameId, String(data.game_id));

    enterGameView();
  } catch (error) {
    alert(error.message);
  }
}

async function joinGameById() {
  if (!state.playerId) {
    alert("Create or load a player first.");
    return;
  }

  const gameId = Number(document.getElementById("joinGameId").value);

  if (!gameId) {
    alert("Enter a valid game ID.");
    return;
  }

  try {
    await api(`/games/${gameId}/join`, {
      method: "POST",
      body: JSON.stringify({ player_id: state.playerId })
    });

    state.gameId = gameId;
    localStorage.setItem(STORAGE_KEYS.gameId, String(gameId));

    enterGameView();
  } catch (error) {
    alert(error.message);
  }
}

function resumeSavedGame() {
  if (!state.gameId || !state.playerId) {
    alert("No saved game or player found.");
    return;
  }

  enterGameView();
}

function leaveToLanding() {
  stopPolling();
  document.getElementById("landingView").classList.remove("hidden");
  document.getElementById("gameView").classList.add("hidden");
}

function enterGameView() {
  document.getElementById("landingView").classList.add("hidden");
  document.getElementById("gameView").classList.remove("hidden");

  document.getElementById("sessionServer").textContent = state.serverUrl || "-";
  document.getElementById("sessionUsername").textContent = state.username || "-";
  document.getElementById("sessionPlayerId").textContent = state.playerId || "-";
  document.getElementById("sessionGameId").textContent = state.gameId || "-";

  refreshGame();
  startPolling();
}

function startPolling() {
  stopPolling();

  state.pollTimer = setInterval(async () => {
    if (!document.getElementById("gameView").classList.contains("hidden")) {
      await refreshGame(true);
    }
  }, 3000);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function refreshGame(silent = false) {
  if (!state.gameId || !state.playerId) return;

  try {
    const [game, stats] = await Promise.all([
      api(`/games/${state.gameId}`),
      api(`/players/${state.playerId}/stats`)
    ]);

    state.game = game;
    state.stats = stats;
    state.gridSize = game.grid_size || state.gridSize || 10;

    await loadBoards();
    renderStats();
    renderGameState();
  } catch (error) {
    if (!silent) {
      alert(error.message);
    }
  }
}

async function loadBoards() {
  try {
    const own = await api(`/test/games/${state.gameId}/board/${state.playerId}`);
    state.ownBoard = normalizeBoard(own.board || own.grid || own);
  } catch {
    state.ownBoard = buildEmptyBoard(state.gridSize);
  }

  const opponentIds = getOpponentIds();

  if (!state.selectedTargetPlayerId || !opponentIds.includes(state.selectedTargetPlayerId)) {
    state.selectedTargetPlayerId = opponentIds[0] || null;
    if (state.selectedTargetPlayerId) {
      localStorage.setItem(
        STORAGE_KEYS.targetPlayerId,
        String(state.selectedTargetPlayerId)
      );
    }
  }

  if (state.selectedTargetPlayerId) {
    try {
      const enemy = await api(
        `/test/games/${state.gameId}/board/${state.selectedTargetPlayerId}`
      );
      const raw = normalizeBoard(enemy.board || enemy.grid || enemy);
      state.targetBoard = maskEnemyBoard(raw);
    } catch {
      state.targetBoard = buildEmptyBoard(state.gridSize);
    }
  } else {
    state.targetBoard = buildEmptyBoard(state.gridSize);
  }
}

function getOpponentIds() {
  return extractPlayersFromGame()
    .map((p) => Number(p.player_id ?? p.id))
    .filter((id) => id && id !== state.playerId);
}

function extractPlayersFromGame() {
  if (!state.game) return [];
  return state.game.players || state.game.game_players || state.game.participants || [];
}

function renderStats() {
  const stats = state.stats || {};

  document.getElementById("statGames").textContent = stats.games_played ?? 0;
  document.getElementById("statWins").textContent = stats.wins ?? 0;
  document.getElementById("statLosses").textContent = stats.losses ?? 0;

  const accuracy =
    typeof stats.accuracy === "number"
      ? `${stats.accuracy}%`
      : (stats.accuracy ?? "0%");

  document.getElementById("statAccuracy").textContent = accuracy;
}

function renderGameState() {
  const game = state.game || {};
  const status = game.status || "unknown";
  const currentTurn =
    game.current_turn_player_id ||
    game.current_player_id ||
    game.current_turn ||
    null;

  const myTurn = Number(currentTurn) === Number(state.playerId);

  const turnIndicator = document.getElementById("turnIndicator");
  turnIndicator.className = `pill ${myTurn ? "turn" : ""}`;
  turnIndicator.textContent = myTurn ? "Your turn" : "Waiting for another player";

  document.getElementById("gameStatusPill").textContent = `Status: ${status}`;
  document.getElementById("placementHint").textContent =
    status === "waiting"
      ? "Game is waiting. Pick exactly 3 cells on your board and submit your ship placement."
      : "Game active. Click an enemy cell on the target board when it is your turn.";

  renderPlayersPanel(currentTurn);
  renderTargetSelect();

  renderBoard("ownBoard", state.ownBoard, {
    clickable: status === "waiting",
    onClick: onOwnBoardCellClick,
    showShips: true
  });

  renderBoard("targetBoard", state.targetBoard, {
    clickable: myTurn && status === "active",
    onClick: onTargetBoardCellClick,
    showShips: false
  });

  renderLog();
}

function renderPlayersPanel(currentTurn) {
  const players = extractPlayersFromGame();
  const wrap = document.getElementById("playersPanel");
  wrap.innerHTML = "";

  if (!players.length) {
    wrap.innerHTML = `<div class="hint">Player list unavailable from this server.</div>`;
    return;
  }

  players.forEach((player) => {
    const id = Number(player.player_id ?? player.id);
    const name = player.username || player.name || `Player ${id}`;
    const eliminated = !!(player.is_eliminated || player.eliminated);

    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.innerHTML = `
      <div>
        <strong>${escapeHtml(name)}</strong>
        <div class="meta">ID ${id}${id === state.playerId ? " • You" : ""}</div>
      </div>
      <div class="pill ${id === Number(currentTurn) ? "turn" : ""}">
        ${eliminated ? "Eliminated" : (id === Number(currentTurn) ? "Current Turn" : "Active")}
      </div>
    `;

    wrap.appendChild(chip);
  });
}

function renderTargetSelect() {
  const select = document.getElementById("targetPlayerSelect");
  const players = extractPlayersFromGame().filter(
    (p) => Number(p.player_id ?? p.id) !== Number(state.playerId)
  );

  select.innerHTML = "";

  if (!players.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No opponents yet";
    select.appendChild(option);
    return;
  }

  players.forEach((player) => {
    const id = Number(player.player_id ?? player.id);
    const option = document.createElement("option");
    option.value = id;
    option.textContent = player.username || player.name || `Player ${id}`;

    if (id === Number(state.selectedTargetPlayerId)) {
      option.selected = true;
    }

    select.appendChild(option);
  });
}

function saveTargetSelection() {
  const value = Number(document.getElementById("targetPlayerSelect").value);
  state.selectedTargetPlayerId = value || null;

  if (value) {
    localStorage.setItem(STORAGE_KEYS.targetPlayerId, String(value));
  }

  refreshGame(true);
}

function onOwnBoardCellClick(row, col) {
  if ((state.game?.status || "waiting") !== "waiting") return;

  const key = `${row},${col}`;
  const exists = state.selectedPlacement.find((pos) => `${pos.row},${pos.col}` === key);

  if (exists) {
    state.selectedPlacement = state.selectedPlacement.filter(
      (pos) => `${pos.row},${pos.col}` !== key
    );
  } else {
    if (state.selectedPlacement.length >= 3) {
      alert("Pick exactly 3 ship positions.");
      return;
    }
    state.selectedPlacement.push({ row, col });
  }

  renderBoard("ownBoard", state.ownBoard, {
    clickable: true,
    onClick: onOwnBoardCellClick,
    showShips: true
  });
}

async function submitPlacement() {
  if (!state.gameId || !state.playerId) return;

  if (state.selectedPlacement.length !== 3) {
    alert("Select exactly 3 cells for ship placement.");
    return;
  }

  try {
    await api(`/games/${state.gameId}/place`, {
      method: "POST",
      body: JSON.stringify({
        player_id: state.playerId,
        ships: state.selectedPlacement
      })
    });

    state.selectedPlacement = [];
    await refreshGame();
  } catch (error) {
    alert(error.message);
  }
}

function clearPlacementSelection() {
  state.selectedPlacement = [];

  renderBoard("ownBoard", state.ownBoard, {
    clickable: true,
    onClick: onOwnBoardCellClick,
    showShips: true
  });
}

async function onTargetBoardCellClick(row, col) {
  const game = state.game || {};
  const currentTurn =
    game.current_turn_player_id ||
    game.current_player_id ||
    game.current_turn ||
    null;

  if ((game.status || "") !== "active") return;

  if (Number(currentTurn) !== Number(state.playerId)) {
    alert("It is not your turn.");
    return;
  }

  if (!state.selectedTargetPlayerId) {
    alert("Choose an opponent first.");
    return;
  }

  try {
    await api(`/games/${state.gameId}/fire`, {
      method: "POST",
      body: JSON.stringify({
        player_id: state.playerId,
        target_player_id: state.selectedTargetPlayerId,
        row,
        col
      })
    });

    await refreshGame();
  } catch (error) {
    alert(error.message);
  }
}

function renderBoard(elementId, boardData, options = {}) {
  const {
    clickable = false,
    onClick = null,
    showShips = false
  } = options;

  const el = document.getElementById(elementId);
  const size = state.gridSize || 10;
  const board = normalizeBoard(boardData);

  el.innerHTML = "";
  el.style.gridTemplateColumns = `repeat(${size}, 34px)`;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = board[row]?.[col] ?? 0;

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";

      if (clickable) {
        cell.classList.add("clickable");
      }

      if (showShips && isShipValue(value)) {
        cell.classList.add("ship");
      }

      if (isHitValue(value)) {
        cell.classList.add("hit");
        cell.textContent = "X";
      }

      if (isMissValue(value)) {
        cell.classList.add("miss");
        cell.textContent = "•";
      }

      if (elementId === "ownBoard") {
        if (state.selectedPlacement.some((pos) => pos.row === row && pos.col === col)) {
          cell.classList.add("pending");
          cell.textContent = "S";
        }
      }

      if (clickable && onClick) {
        cell.addEventListener("click", () => onClick(row, col));
      } else {
        cell.disabled = true;
      }

      el.appendChild(cell);
    }
  }
}

function renderLog() {
  const log = document.getElementById("log");
  const moves = state.game?.moves || state.game?.move_log || [];

  if (!moves.length) {
    log.textContent = "No moves recorded yet.";
    return;
  }

  log.textContent = moves
    .map((move) => {
      const pid = move.player_id ?? move.playerId ?? "?";
      const hit = move.hit === true ? "HIT" : move.hit === false ? "MISS" : "MOVE";
      const row = move.row ?? "?";
      const col = move.col ?? "?";
      const time = move.move_time || move.timestamp || "";
      return `Player ${pid} -> (${row}, ${col}) ${hit}${time ? ` at ${time}` : ""}`;
    })
    .join("\n");
}

async function loadLobbyList() {
  const wrap = document.getElementById("lobbyList");
  wrap.innerHTML = `<div class="hint">Loading lobbies...</div>`;

  try {
    const data = await api("/games");
    const games = Array.isArray(data) ? data : (data.games || []);

    wrap.innerHTML = "";

    if (!games.length) {
      wrap.innerHTML = `<div class="hint">No open lobbies found, or this server does not expose a games list endpoint.</div>`;
      return;
    }

    games.forEach((game) => {
      const row = document.createElement("div");
      row.className = "game-row";

      const id = game.game_id ?? game.id;
      const grid = game.grid_size ?? "-";
      const status = game.status ?? "unknown";
      const count = game.players || game.player_count || game.current_players || "?";

      row.innerHTML = `
        <div>
          <h4>Game #${id}</h4>
          <div class="meta">Grid ${grid} • Status ${status} • Players ${count}</div>
        </div>
      `;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";
      btn.textContent = "Join";
      btn.onclick = async () => {
        document.getElementById("joinGameId").value = id;
        await joinGameById();
      };

      row.appendChild(btn);
      wrap.appendChild(row);
    });
  } catch (error) {
    wrap.innerHTML = `<div class="hint">Could not load lobbies: ${escapeHtml(error.message)}</div>`;
  }
}

function normalizeBoard(board) {
  if (Array.isArray(board) && Array.isArray(board[0])) {
    return board;
  }
  return buildEmptyBoard(state.gridSize || 10);
}

function buildEmptyBoard(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0)
  );
}

function maskEnemyBoard(board) {
  return board.map((row) =>
    row.map((value) => {
      if (isHitValue(value) || isMissValue(value)) return value;
      return 0;
    })
  );
}

function isShipValue(value) {
  return value === 1 || value === "ship" || value === "S";
}

function isHitValue(value) {
  return value === "hit" || value === "X" || value === 3 || value === "3";
}

function isMissValue(value) {
  return value === "miss" || value === "M" || value === 2 || value === "2";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("load", () => {
  loadSavedIdentity();
});