'use strict';

const { StatusCodes } = require('http-status-codes');

/**
 * Operational API Error — safe to expose to clients.
 * Programming errors should be thrown as plain Errors
 * and caught by the global error handler.
 */
class ApiError extends Error {
  /**
   * @param {number}   statusCode  - HTTP status code
   * @param {string}   message     - Human-readable error message
   * @param {Array}    [errors=[]] - Field-level validation errors
   * @param {boolean}  [isOperational=true]
   */
  constructor(
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR,
    message = 'Something went wrong',
    errors = [],
    isOperational = true,
  ) {
    super(message);

    this.statusCode    = statusCode;
    this.message       = message;
    this.errors        = errors;   // Field-level errors e.g. [{ field, message }]
    this.isOperational = isOperational;
    this.success       = false;

    // Capture clean stack trace (exclude this constructor frame)
    Error.captureStackTrace(this, this.constructor);
  }

  // ── Convenience factory methods ─────────────────────────────────────────────

  static badRequest(message = 'Bad request', errors = []) {
    return new ApiError(StatusCodes.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(StatusCodes.UNAUTHORIZED, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(StatusCodes.FORBIDDEN, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(StatusCodes.NOT_FOUND, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(StatusCodes.CONFLICT, message);
  }

  static unprocessable(message = 'Validation failed', errors = []) {
    return new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, message, errors);
  }

  static tooManyRequests(message = 'Too many requests, please try again later') {
    return new ApiError(StatusCodes.TOO_MANY_REQUESTS, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, message, [], false);
  }
}

module.exports = ApiError;
