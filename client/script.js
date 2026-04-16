// ALWAYS use same backend (works locally + on Render)
const API_BASE = "/api";

function showOutput(data) {
  document.getElementById("output").textContent = JSON.stringify(data, null, 2);
}

function showError(error) {
  document.getElementById("output").textContent = JSON.stringify(
    { error: error.message || error },
    null,
    2
  );
}

async function handleResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    data = { message: "No JSON response returned." };
  }

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

// ---------------- PLAYERS ----------------

async function createPlayer() {
  const username = document.getElementById("username").value.trim();

  if (!username) {
    showError("Username is required.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });

    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

async function getPlayerStats() {
  const playerId = document.getElementById("statsPlayerId").value;

  if (!playerId) {
    showError("Player ID required");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/players/${playerId}/stats`);
    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

// ---------------- GAMES ----------------

async function createGame() {
  const player_id = Number(document.getElementById("creatorId").value);
  const grid_size = Number(document.getElementById("gridSize").value);

  if (!player_id || !grid_size) {
    showError("Missing inputs");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/games`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id, grid_size })
    });

    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

async function joinGame() {
  const gameId = document.getElementById("joinGameId").value;
  const player_id = Number(document.getElementById("joinPlayerId").value);

  if (!gameId || !player_id) {
    showError("Missing inputs");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/games/${gameId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id })
    });

    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

async function getGameInfo() {
  const gameId = document.getElementById("gameInfoId").value;

  if (!gameId) {
    showError("Game ID required");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/games/${gameId}`);
    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

// ---------------- SHIPS ----------------

async function placeShips() {
  const gameId = document.getElementById("placeGameId").value;
  const player_id = Number(document.getElementById("placePlayerId").value);
  const shipsText = document.getElementById("shipsJson").value.trim();

  if (!gameId || !player_id || !shipsText) {
    showError("Missing inputs");
    return;
  }

  let ships;
  try {
    ships = JSON.parse(shipsText);
  } catch {
    showError("Invalid JSON");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/games/${gameId}/place`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id, ships })
    });

    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

// ---------------- FIRE ----------------

async function fireShot() {
  const gameId = document.getElementById("fireGameId").value;
  const player_id = Number(document.getElementById("firePlayerId").value);
  const row = Number(document.getElementById("fireRow").value);
  const col = Number(document.getElementById("fireCol").value);

  if (!gameId || !player_id || isNaN(row) || isNaN(col)) {
    showError("Missing inputs");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/games/${gameId}/fire`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id, row, col })
    });

    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

// ---------------- TEST ----------------

async function getBoard() {
  const gameId = document.getElementById("boardGameId").value;
  const playerId = document.getElementById("boardPlayerId").value;

  if (!gameId || !playerId) {
    showError("Missing inputs");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/test/games/${gameId}/board/${playerId}`);
    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}

// ---------------- RESET ----------------

async function resetDatabase() {
  try {
    const res = await fetch(`${API_BASE}/reset`, {
      method: "POST"
    });

    showOutput(await handleResponse(res));
  } catch (err) {
    showError(err);
  }
}