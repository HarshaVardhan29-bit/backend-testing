'use strict';

/**
 * Wraps an async route handler so that any rejected promise
 * is automatically forwarded to Express's next(err) handler.
 * Eliminates try/catch boilerplate in every controller.
 *
 * @param {Function} fn - Async Express route handler
 * @returns {Function}  - Express-compatible middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
