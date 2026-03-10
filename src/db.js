const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "battleship",
  password: "password",
  port: 5432,
});

module.exports = pool;