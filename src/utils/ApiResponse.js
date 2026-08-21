'use strict';

/**
 * Standardised success response envelope.
 * Keeps all API responses in a consistent shape.
 *
 * Shape:
 * {
 *   success: true,
 *   statusCode: 200,
 *   message: "...",
 *   data: { ... },
 *   meta: { ... }   // optional — pagination, counts, etc.
 * }
 */
class ApiResponse {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {*}      [data=null]
   * @param {object} [meta={}]
   */
  constructor(statusCode, message, data = null, meta = {}) {
    this.success    = statusCode < 400;
    this.statusCode = statusCode;
    this.message    = message;
    this.data       = data;

    if (Object.keys(meta).length > 0) {
      this.meta = meta;
    }
  }

  /**
   * Sends the response through the Express res object.
   * @param {import('express').Response} res
   */
  send(res) {
    return res.status(this.statusCode).json(this);
  }
}

module.exports = ApiResponse;
