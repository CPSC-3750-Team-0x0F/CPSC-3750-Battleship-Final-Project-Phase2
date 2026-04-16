function getApiBase() {
  return document.getElementById("apiBase").value.trim();
}

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

async function createPlayer() {
  const api = getApiBase();
  const username = document.getElementById("username").value.trim();

  if (!username) {
    showError("Username is required.");
    return;
  }

  try {
    const response = await fetch(`${api}/players`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username })
    });

    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function getPlayerStats() {
  const api = getApiBase();
  const playerId = document.getElementById("statsPlayerId").value;

  if (!playerId) {
    showError("Player ID is required.");
    return;
  }

  try {
    const response = await fetch(`${api}/players/${playerId}/stats`);
    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function createGame() {
  const api = getApiBase();
  const player_id = Number(document.getElementById("creatorId").value);
  const grid_size = Number(document.getElementById("gridSize").value);

  if (!player_id || !grid_size) {
    showError("Creator Player ID and Grid Size are required.");
    return;
  }

  try {
    const response = await fetch(`${api}/games`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id, grid_size })
    });

    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function joinGame() {
  const api = getApiBase();
  const gameId = document.getElementById("joinGameId").value;
  const player_id = Number(document.getElementById("joinPlayerId").value);

  if (!gameId || !player_id) {
    showError("Game ID and Player ID are required.");
    return;
  }

  try {
    const response = await fetch(`${api}/games/${gameId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id })
    });

    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function getGameInfo() {
  const api = getApiBase();
  const gameId = document.getElementById("gameInfoId").value;

  if (!gameId) {
    showError("Game ID is required.");
    return;
  }

  try {
    const response = await fetch(`${api}/games/${gameId}`);
    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function placeShips() {
  const api = getApiBase();
  const gameId = document.getElementById("placeGameId").value;
  const player_id = Number(document.getElementById("placePlayerId").value);
  const shipsText = document.getElementById("shipsJson").value.trim();

  if (!gameId || !player_id || !shipsText) {
    showError("Game ID, Player ID, and Ships JSON are required.");
    return;
  }

  let ships;
  try {
    ships = JSON.parse(shipsText);
  } catch {
    showError("Ships JSON is invalid.");
    return;
  }

  try {
    const response = await fetch(`${api}/games/${gameId}/place`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id, ships })
    });

    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function fireShot() {
  const api = getApiBase();
  const gameId = document.getElementById("fireGameId").value;
  const player_id = Number(document.getElementById("firePlayerId").value);
  const row = Number(document.getElementById("fireRow").value);
  const col = Number(document.getElementById("fireCol").value);

  if (!gameId || !player_id || Number.isNaN(row) || Number.isNaN(col)) {
    showError("Game ID, Player ID, row, and col are required.");
    return;
  }

  try {
    const response = await fetch(`${api}/games/${gameId}/fire`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ player_id, row, col })
    });

    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function getBoard() {
  const api = getApiBase();
  const gameId = document.getElementById("boardGameId").value;
  const playerId = document.getElementById("boardPlayerId").value;

  if (!gameId || !playerId) {
    showError("Game ID and Player ID are required.");
    return;
  }

  try {
    const response = await fetch(`${api}/test/games/${gameId}/board/${playerId}`);
    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}

async function resetDatabase() {
  const api = getApiBase();

  try {
    const response = await fetch(`${api}/reset`, {
      method: "POST"
    });

    const data = await handleResponse(response);
    showOutput(data);
  } catch (error) {
    showError(error);
  }
}