'use strict';

const { StatusCodes } = require('http-status-codes');
const ApiError = require('../utils/ApiError');
const logger   = require('../config/logger');
const env      = require('../config/env');

/**
 * Converts known library errors into ApiErrors before
 * passing them to the main error handler.
 */
const normalizeError = (err) => {
  // ── Mongoose validation error ──────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return ApiError.unprocessable('Validation failed', errors);
  }

  // ── Mongoose duplicate key error ───────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`${field} already exists`);
  }

  // ── Mongoose cast error (invalid ObjectId, etc.) ───────────────────────────
  if (err.name === 'CastError') {
    return ApiError.badRequest(`Invalid value for field '${err.path}'`);
  }

  // ── SyntaxError from JSON body parser ────────────────────────────────────
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return ApiError.badRequest('Invalid JSON in request body');
  }

  return err;
};

/**
 * Global error-handling middleware.
 * Must have exactly 4 parameters for Express to treat it as an error handler.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const normalized = normalizeError(err);

  const statusCode = normalized instanceof ApiError
    ? normalized.statusCode
    : StatusCodes.INTERNAL_SERVER_ERROR;

  const isOperational = normalized instanceof ApiError
    ? normalized.isOperational
    : false;

  // Log programming errors with full stack trace
  if (!isOperational) {
    logger.error('Unhandled error', {
      requestId: req.requestId,
      method:    req.method,
      url:       req.originalUrl,
      error:     err.message,
      stack:     err.stack,
    });
  } else {
    logger.warn('Operational error', {
      requestId:  req.requestId,
      statusCode,
      message:    normalized.message,
    });
  }

  const response = {
    success:    false,
    statusCode,
    message:    isOperational
      ? normalized.message
      : 'An unexpected error occurred. Please try again later.',
    requestId: req.requestId,
  };

  // Include field-level errors (validation) if present
  if (isOperational && normalized.errors?.length > 0) {
    response.errors = normalized.errors;
  }

  // Include stack trace in development only
  if (!env.isProduction && !isOperational) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 handler — must be registered after all routes.
 */
const notFoundHandler = (req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success:    false,
    statusCode: StatusCodes.NOT_FOUND,
    message:    `Route ${req.method} ${req.originalUrl} not found`,
    requestId:  req.requestId,
  });
};

module.exports = { errorHandler, notFoundHandler };
