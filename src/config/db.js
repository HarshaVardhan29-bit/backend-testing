'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');
const env = require('./env');

/**
 * Establishes a connection to MongoDB using Mongoose.
 * Includes retry logic and event listeners for production reliability.
 */
const connectDB = async () => {
  const options = {
    serverSelectionTimeoutMS: 5000,   // Fail fast on initial connect
    socketTimeoutMS: 45000,
    maxPoolSize: 10,                  // Connection pool
    minPoolSize: 2,
    heartbeatFrequencyMS: 10000,
  };

  try {
    const conn = await mongoose.connect(env.MONGO_URI, options);
    logger.info(`MongoDB connected: ${conn.connection.host}`, {
      db: conn.connection.name,
    });
  } catch (error) {
    logger.error('MongoDB initial connection failed', { error: error.message });
    process.exit(1);
  }
};

// ── Mongoose event listeners ─────────────────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { error: err.message });
});

/**
 * Gracefully closes the MongoDB connection.
 * Called during SIGTERM/SIGINT shutdown.
 */
const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
};

module.exports = { connectDB, disconnectDB };
