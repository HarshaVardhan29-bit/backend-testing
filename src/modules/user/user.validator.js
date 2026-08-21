'use strict';

const { z } = require('zod');

// ── Reusable primitives ──────────────────────────────────────────────────────

const nameField = (label) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(2, `${label} must be at least 2 characters`)
    .max(50, `${label} must not exceed 50 characters`)
    .regex(/^[A-Za-z\s'-]+$/, `${label} contains invalid characters`);

const emailField = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Must be a valid email address')
  .max(255, 'Email must not exceed 255 characters');

const passwordField = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const phoneField = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format e.g. +919876543210')
  .optional();

const otpField = z
  .string({ required_error: 'OTP is required' })
  .trim()
  .length(6, 'OTP must be exactly 6 digits')
  .regex(/^\d{6}$/, 'OTP must contain only digits');

// ── Schema definitions ───────────────────────────────────────────────────────

/**
 * Schema: POST /api/v1/auth/signup
 */
const signupSchema = z
  .object({
    firstName: nameField('First name'),
    lastName:  nameField('Last name'),
    email:     emailField,
    password:  passwordField,
    phone:     phoneField,
    signupSource: z
      .enum(['web', 'mobile', 'api'], {
        errorMap: () => ({ message: 'signupSource must be web, mobile, or api' }),
      })
      .optional()
      .default('api'),
  })
  .strict();  // Reject any extra/unknown keys

/**
 * Schema: POST /api/v1/auth/verify-email
 */
const verifyEmailSchema = z
  .object({
    email: emailField,
    otp:   otpField,
  })
  .strict();

/**
 * Schema: POST /api/v1/auth/resend-otp
 */
const resendOtpSchema = z
  .object({
    email: emailField,
  })
  .strict();

// ── Validation middleware factory ─────────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body against the
 * provided Zod schema. On failure, forwards a 422 ApiError to next().
 *
 * @param {z.ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    const ApiError = require('../utils/ApiError');
    const errors = result.error.errors.map((e) => ({
      field:   e.path.join('.'),
      message: e.message,
    }));
    return next(ApiError.unprocessable('Validation failed', errors));
  }

  // Replace req.body with the parsed (and coerced) data
  req.body = result.data;
  next();
};

module.exports = {
  signupSchema,
  verifyEmailSchema,
  resendOtpSchema,
  validate,
};
