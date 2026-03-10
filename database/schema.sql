CREATE TABLE Players (
    player_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    total_shots INTEGER DEFAULT 0,
    total_hits INTEGER DEFAULT 0
);

CREATE TABLE Games (
    game_id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES Players(player_id),
    grid_size INTEGER NOT NULL,
    max_players INTEGER NOT NULL,
    status VARCHAR(20) CHECK(status IN ('waiting', 'active', 'finished')),
    current_turn_index INTEGER DEFAULT 0,
    winner_id INTEGER REFERENCES Players(player_id)
);

CREATE TABLE GamePlayers (
    game_id INTEGER REFERENCES Games(game_id),
    player_id INTEGER REFERENCES Players(player_id),
    turn_order INTEGER NOT NULL,
    is_eliminated BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (game_id, player_id)
);

CREATE TABLE Ships (
    ship_id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES Games(game_id),
    player_id INTEGER REFERENCES Players(player_id),
    row INTEGER NOT NULL,
    col INTEGER NOT NULL
);

CREATE TABLE Moves (
    move_id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES Games(game_id),
    player_id INTEGER REFERENCES Players(player_id),
    row INTEGER NOT NULL,
    col INTEGER NOT NULL,
    result VARCHAR(10) CHECK(result IN ('hit', 'miss')),
    move_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);