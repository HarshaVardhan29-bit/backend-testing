'use strict';

const morgan  = require('morgan');
const { v4: uuidv4 } = require('uuid');  // uuid@11 still exports v4 for CJS
const logger  = require('../config/logger');
const env     = require('../config/env');

// ── Assign a unique request ID to every request ───────────────────────────────

const assignRequestId = (req, res, next) => {
  const requestId = uuidv4();
  req.requestId   = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

// ── Morgan stream → Winston ───────────────────────────────────────────────────

const morganStream = {
  write: (message) => logger.http(message.trim()),
};

const morganFormat = env.isProduction
  ? 'combined'
  : ':method :url :status :res[content-length] - :response-time ms';

const httpLogger = morgan(morganFormat, { stream: morganStream });

module.exports = { assignRequestId, httpLogger };
