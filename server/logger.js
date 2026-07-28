// BusCommand — strukturisano logovanje (pino)
const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "buscommand-api" },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = { logger };
