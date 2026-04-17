DROP TABLE IF EXISTS moves CASCADE;
DROP TABLE IF EXISTS ships CASCADE;
DROP TABLE IF EXISTS game_players CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS players CASCADE;

CREATE TABLE players (
    player_id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    total_shots INTEGER NOT NULL DEFAULT 0,
    total_hits INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE games (
    game_id SERIAL PRIMARY KEY,
    creator_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    grid_size INTEGER NOT NULL CHECK (grid_size BETWEEN 5 AND 15),
    max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 10),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting_setup'
        CHECK (status IN ('waiting_setup', 'playing', 'finished')),
    current_turn_index INTEGER NOT NULL DEFAULT 0,
    winner_id INTEGER REFERENCES players(player_id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_players (
    game_id INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    turn_order INTEGER NOT NULL,
    is_eliminated BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (game_id, player_id),
    UNIQUE (game_id, turn_order)
);

CREATE TABLE ships (
    ship_id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    UNIQUE (game_id, player_id, row, col)
);

CREATE TABLE moves (
    move_id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    result VARCHAR(10) NOT NULL CHECK (result IN ('hit', 'miss')),
    move_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (game_id, player_id, row, col)
);
);
