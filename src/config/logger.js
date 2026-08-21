'use strict';

const winston = require('winston');
const env = require('./env');

// ── Custom log levels & colors ───────────────────────────────────────────────
const levels = {
  error: 0,
  warn:  1,
  info:  2,
  http:  3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn:  'yellow',
  info:  'green',
  http:  'magenta',
  debug: 'white',
};

winston.addColors(colors);

// ── Formats ──────────────────────────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    ({ timestamp, level, message, ...meta }) =>
      `${timestamp} [${level}] ${message}${
        Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
      }`,
  ),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// ── Transports ───────────────────────────────────────────────────────────────
const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: fileFormat,
    maxsize: 10 * 1024 * 1024,  // 10 MB
    maxFiles: 5,
    tailable: true,
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: fileFormat,
    maxsize: 20 * 1024 * 1024,  // 20 MB
    maxFiles: 10,
    tailable: true,
  }),
];

// ── Logger instance ──────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  levels,
  transports,
  exitOnError: false,
});

module.exports = logger;
