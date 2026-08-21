'use strict';

const crypto = require('crypto');
const { StatusCodes } = require('http-status-codes');

const userRepo = require('./user.repository');
const ApiError = require('../../utils/ApiError');
const emailUtil = require('../../utils/email');
const logger = require('../../config/logger');
const env = require('../../config/env');

// ── OTP helpers ───────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically random 6-digit OTP.
 * @returns {string}
 */
const generateOtp = () => {
  // Generates a number in [100000, 999999]
  const buf = crypto.randomBytes(3);
  const num = (buf.readUIntBE(0, 3) % 900000) + 100000;
  return String(num);
};

/**
 * Calculates OTP expiry Date from now.
 * @returns {Date}
 */
const otpExpiresAt = () =>
  new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

// ── Service methods ───────────────────────────────────────────────────────────

/**
 * Registers a new user.
 *  1. Checks email uniqueness
 *  2. Creates user with status = pending_verification
 *  3. Generates OTP and sends verification email
 *
 * @param {object} data  - Validated signup payload
 * @param {object} meta  - { ipAddress, userAgent }
 * @returns {Promise<object>} Public user profile
 */
const signup = async (data, meta = {}) => {
  const { firstName, lastName, email, password, phone, signupSource } = data;

  // ── 1. Check email uniqueness ──────────────────────────────────────────────
  const existing = await userRepo.findByEmail(email);
  if (existing) {
    if (existing.emailVerified) {
      throw ApiError.conflict('An account with this email already exists');
    }
    // Unverified duplicate — guide the user to resend OTP instead
    throw ApiError.conflict(
      'An unverified account exists for this email. Please verify it or request a new OTP.',
    );
  }

  // ── 2. Generate OTP ────────────────────────────────────────────────────────
  const otp = generateOtp();

  // ── 3. Create user ─────────────────────────────────────────────────────────
  const user = await userRepo.createUser({
    firstName,
    lastName,
    email,
    password,
    phone:    phone || undefined,
    metadata: {
      ipAddress:    meta.ipAddress,
      userAgent:    meta.userAgent,
      signupSource: signupSource || 'api',
    },
    emailOtp: {
      code:       otp,
      expiresAt:  otpExpiresAt(),
      attempts:   0,
      lastSentAt: new Date(),
    },
  });

  // ── 4. Send OTP email ──────────────────────────────────────────────────────
  try {
    await emailUtil.sendOtpEmail({ to: email, firstName, otp });
  } catch (emailError) {
    logger.error('Failed to send OTP email after signup', {
      userId: user._id,
      error:  emailError.message,
    });
    // Don't block signup — user can resend OTP
  }

  logger.info('User signed up', { userId: user._id, email });
  return user.toPublicProfile();
};

/**
 * Verifies the OTP sent to the user's email.
 *  1. Finds user with OTP data
 *  2. Validates OTP is not expired, not over attempt limit
 *  3. Compares OTP codes
 *  4. Activates account on success
 *
 * @param {string} email
 * @param {string} otp
 * @returns {Promise<object>} Public user profile
 */
const verifyEmail = async (email, otp) => {
  // ── 1. Load user + OTP (both are select:false) ────────────────────────────
  const user = await userRepo.findByEmailWithOtp(email);

  if (!user) {
    throw ApiError.notFound('No account found with this email');
  }

  if (user.emailVerified) {
    throw ApiError.badRequest('This email has already been verified');
  }

  const otpData = user.emailOtp;

  if (!otpData || !otpData.code) {
    throw ApiError.badRequest(
      'No verification OTP found. Please request a new one.',
    );
  }

  // ── 2. Check attempt limit ─────────────────────────────────────────────────
  if (otpData.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw ApiError.tooManyRequests(
      `Maximum OTP attempts exceeded. Please request a new OTP.`,
    );
  }

  // ── 3. Check expiry ────────────────────────────────────────────────────────
  if (new Date() > otpData.expiresAt) {
    throw ApiError.badRequest(
      'OTP has expired. Please request a new one.',
    );
  }

  // ── 4. Increment attempt counter early (prevents brute-force) ─────────────
  await userRepo.updateById(user._id, {
    $inc: { 'emailOtp.attempts': 1 },
  });

  // ── 5. Compare OTP (timing-safe) ──────────────────────────────────────────
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(otp),
    Buffer.from(otpData.code),
  );

  if (!isMatch) {
    const attemptsLeft = env.OTP_MAX_ATTEMPTS - (otpData.attempts + 1);
    throw ApiError.badRequest(
      `Invalid OTP. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
    );
  }

  // ── 6. Activate account ────────────────────────────────────────────────────
  const updated = await userRepo.updateById(user._id, {
    emailVerified: true,
    status:        'active',
    $unset:        { emailOtp: '' },
  });

  logger.info('Email verified — account activated', { userId: user._id });
  return updated.toPublicProfile();
};

/**
 * Resends a new OTP to the user's email.
 *  1. Validates account state
 *  2. Enforces cooldown between resends
 *  3. Generates fresh OTP and sends it
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
const resendOtp = async (email) => {
  const user = await userRepo.findByEmailWithOtp(email);

  if (!user) {
    // Security: don't reveal whether an account exists
    return;
  }

  if (user.emailVerified) {
    throw ApiError.badRequest('This email has already been verified');
  }

  if (user.status === 'suspended') {
    throw ApiError.forbidden('Account is suspended');
  }

  // ── Cooldown check ─────────────────────────────────────────────────────────
  const otpData = user.emailOtp;

  // ── Resend count limit ─────────────────────────────────────────────────────
  if (otpData && otpData.resendCount >= env.OTP_MAX_RESEND_COUNT) {
    throw ApiError.tooManyRequests(
      `Maximum OTP resend limit reached. Please contact support.`,
    );
  }

  if (otpData && otpData.lastSentAt) {
    const cooldownMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1000;
    const elapsed    = Date.now() - otpData.lastSentAt.getTime();
    if (elapsed < cooldownMs) {
      const waitSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
      throw ApiError.tooManyRequests(
        `Please wait ${waitSeconds} second${waitSeconds !== 1 ? 's' : ''} before requesting a new OTP.`,
      );
    }
  }

  // ── Generate & save new OTP ────────────────────────────────────────────────
  const otp = generateOtp();

  await userRepo.updateById(user._id, {
    emailOtp: {
      code:        otp,
      expiresAt:   otpExpiresAt(),
      attempts:    0,
      lastSentAt:  new Date(),
      resendCount: (otpData?.resendCount ?? 0) + 1,
    },
  });

  // ── Send email ─────────────────────────────────────────────────────────────
  try {
    await emailUtil.sendOtpEmail({ to: email, firstName: user.firstName, otp });
    logger.info('OTP resent', { userId: user._id });
  } catch (emailError) {
    logger.error('Failed to resend OTP email', {
      userId: user._id,
      error:  emailError.message,
    });
    throw ApiError.internal('Failed to send OTP email. Please try again.');
  }
};

module.exports = { signup, verifyEmail, resendOtp };
