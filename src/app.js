'use strict';

const express         = require('express');
const helmet          = require('helmet');
const mongoSanitize   = require('express-mongo-sanitize');
const xss             = require('xss');
const { StatusCodes } = require('http-status-codes');
const mongoose        = require('mongoose');

const { assignRequestId, httpLogger } = require('./middlewares/requestLogger');
const { globalLimiter }               = require('./middlewares/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const userRoutes = require('./modules/user/user.routes');
const logger     = require('./config/logger');

const app = express();

// ── Trust proxy (required for correct IP behind load balancer/Nginx) ──────────
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Request ID + HTTP logging ─────────────────────────────────────────────────
app.use(assignRequestId);
app.use(httpLogger);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));         // Reject huge payloads
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Security: sanitization ────────────────────────────────────────────────────
app.use(mongoSanitize());   // Strip $ and . from keys (NoSQL injection)

// XSS sanitize string values in request body (using maintained xss package)
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    const sanitize = (obj) => {
      if (typeof obj === 'string') return xss(obj);
      if (Array.isArray(obj)) return obj.map(sanitize);
      if (obj && typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, sanitize(v)]),
        );
      }
      return obj;
    };
    req.body = sanitize(req.body);
  }
  next();
});

// ── Global rate limiter ───────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  const dbState  = mongoose.connection.readyState;
  const dbStatus = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

  const healthy = dbState === 1;

  res.status(healthy ? StatusCodes.OK : StatusCodes.SERVICE_UNAVAILABLE).json({
    success:   healthy,
    status:    healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime:    process.uptime(),
    services: {
      database: {
        status: dbStatus[dbState] || 'unknown',
        state:  dbState,
      },
    },
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', userRoutes);

// ── 404 handler (must come after all routes) ──────────────────────────────────
app.use(notFoundHandler);

// ── Global error handler (must be last, 4-arg signature) ─────────────────────
app.use(errorHandler);

module.exports = app;
