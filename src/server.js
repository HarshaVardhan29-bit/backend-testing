'use strict';

// Load environment variables FIRST before any other imports
require('dotenv').config();

const env    = require('./config/env');          // Validates all env vars — will exit if invalid
const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { verifyEmailConnection }   = require('./utils/email');
const { registerCleanupJob }      = require('./jobs/cleanupUnverified');
const app    = require('./app');

// ── Unhandled rejection / exception guards ────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION — shutting down', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION — shutting down', {
    reason: String(reason),
  });
  process.exit(1);
});

// ── Startup ───────────────────────────────────────────────────────────────────

const start = async () => {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Verify SMTP (non-fatal)
  await verifyEmailConnection();

  // 3. Register background jobs
  registerCleanupJob();

  // 4. Start HTTP server
  const server = app.listen(env.PORT, () => {
    logger.info(`Server running`, {
      port:     env.PORT,
      env:      env.NODE_ENV,
      pid:      process.pid,
    });
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────

  const shutdown = async (signal) => {
    logger.info(`${signal} received — starting graceful shutdown`);

    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: err.message });
        process.exit(1);
      }

      await disconnectDB();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force-kill if shutdown takes too long (30 seconds)
    setTimeout(() => {
      logger.error('Forced shutdown — graceful shutdown timed out');
      process.exit(1);
    }, 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
};

start();
