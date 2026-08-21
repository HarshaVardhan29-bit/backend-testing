'use strict';

const { cleanEnv, str, port, num, bool, email } = require('envalid');

/**
 * Validates and exposes all environment variables.
 * The app will throw a descriptive error at startup if any
 * required variable is missing or has the wrong type.
 */
const env = cleanEnv(process.env, {
  // ── Server ──────────────────────────────────────────────────────────────────
  NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
  PORT: port({ default: 5000 }),

  // ── MongoDB ─────────────────────────────────────────────────────────────────
  MONGO_URI: str(),

  // ── Email ───────────────────────────────────────────────────────────────────
  SMTP_HOST: str(),
  SMTP_PORT: port({ default: 587 }),
  SMTP_SECURE: bool({ default: false }),
  SMTP_USER: str(),
  SMTP_PASS: str(),
  EMAIL_FROM: str({ default: 'Enterprise App <no-reply@example.com>' }),

  // ── OTP ─────────────────────────────────────────────────────────────────────
  OTP_EXPIRY_MINUTES: num({ default: 10 }),
  OTP_MAX_ATTEMPTS: num({ default: 5 }),
  OTP_RESEND_COOLDOWN_SECONDS: num({ default: 60 }),

  // ── Rate Limiting ────────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: num({ default: 900000 }),
  RATE_LIMIT_MAX: num({ default: 100 }),
  SIGNUP_RATE_LIMIT_WINDOW_MS: num({ default: 3600000 }),
  SIGNUP_RATE_LIMIT_MAX: num({ default: 10 }),

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  UNVERIFIED_ACCOUNT_TTL_HOURS: num({ default: 24 }),
  CLEANUP_CRON_SCHEDULE: str({ default: '0 * * * *' }),

  // ── Logging ──────────────────────────────────────────────────────────────────
  LOG_LEVEL: str({
    choices: ['error', 'warn', 'info', 'http', 'debug'],
    default: 'info',
  }),
});

module.exports = env;
