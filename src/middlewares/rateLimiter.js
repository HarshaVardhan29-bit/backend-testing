'use strict';

const rateLimit = require('express-rate-limit');
const { StatusCodes } = require('http-status-codes');
const env = require('../config/env');

// ── Response formatter for rate-limit errors ─────────────────────────────────

const rateLimitHandler = (req, res) => {
  res.status(StatusCodes.TOO_MANY_REQUESTS).json({
    success:    false,
    statusCode: StatusCodes.TOO_MANY_REQUESTS,
    message:    'Too many requests from this IP. Please try again later.',
    retryAfter: Math.ceil(res.getHeader('Retry-After')),
  });
};

// ── Global limiter (applied to all routes) ───────────────────────────────────

const globalLimiter = rateLimit({
  windowMs:          env.RATE_LIMIT_WINDOW_MS,
  max:               env.RATE_LIMIT_MAX,
  standardHeaders:   true,   // Return RateLimit-* headers
  legacyHeaders:     false,
  handler:           rateLimitHandler,
  skip: (req) => req.path === '/api/v1/health',   // Never limit health checks
});

// ── Signup-specific limiter (stricter) ───────────────────────────────────────

const signupLimiter = rateLimit({
  windowMs:        env.SIGNUP_RATE_LIMIT_WINDOW_MS,
  max:             env.SIGNUP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
  keyGenerator: (req) => {
    // Key by both IP and email (if provided) for tighter control
    const email = req.body?.email?.toLowerCase();
    return email ? `${req.ip}:${email}` : req.ip;
  },
});

// ── OTP operations limiter (verify + resend) ─────────────────────────────────

const otpLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,   // 15 minutes
  max:             10,               // 10 OTP attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         rateLimitHandler,
});

module.exports = { globalLimiter, signupLimiter, otpLimiter };
