-- 1. players (Matches playerController.js)
CREATE TABLE players (
    player_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_shots INTEGER DEFAULT 0,
    total_hits INTEGER DEFAULT 0
);

-- 2. games (Matches gameController.js)
CREATE TABLE games (
    game_id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES players(player_id),
    grid_size INTEGER NOT NULL,
    max_players INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK(status IN ('waiting', 'active', 'finished')),
    current_turn_index INTEGER DEFAULT 0,
    winner_id INTEGER REFERENCES players(player_id)
);

-- 3. game_players (Matches your code & reset logic)
CREATE TABLE game_players (
    game_id INTEGER REFERENCES games(game_id),
    player_id INTEGER REFERENCES players(player_id),
    turn_order INTEGER, -- Removed NOT NULL because creator is added before order is fully calculated
    is_eliminated BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (game_id, player_id)
);

-- 4. ships (Matches moveController.js and Place Ships contract)
CREATE TABLE ships (
    ship_id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(game_id),
    player_id INTEGER REFERENCES players(player_id),
    row INTEGER NOT NULL,
    col INTEGER NOT NULL
);

-- 5. moves (Matches Move History and Fire Shot contract)
CREATE TABLE moves (
    move_id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(game_id),
    player_id INTEGER REFERENCES players(player_id),
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    -- Include x/y ONLY if your moveController.js explicitly uses those names
    x INTEGER, 
    y INTEGER,
    result VARCHAR(10) CHECK(result IN ('hit', 'miss')),
    move_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);