'use strict';

const { StatusCodes } = require('http-status-codes');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse  = require('../../utils/ApiResponse');
const userService  = require('./user.service');

// ── Helper to extract client metadata ────────────────────────────────────────

const getClientMeta = (req) => ({
  ipAddress: req.ip || req.socket?.remoteAddress,
  userAgent: req.get('User-Agent') || 'unknown',
});

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/signup
 * Registers a new user and dispatches an OTP verification email.
 */
const signup = asyncHandler(async (req, res) => {
  const user = await userService.signup(req.body, getClientMeta(req));

  new ApiResponse(
    StatusCodes.CREATED,
    'Account created. Please check your email for the verification OTP.',
    user,
  ).send(res);
});

/**
 * POST /api/v1/auth/verify-email
 * Verifies the OTP and activates the user account.
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await userService.verifyEmail(email, otp);

  new ApiResponse(
    StatusCodes.OK,
    'Email verified successfully. Your account is now active.',
    user,
  ).send(res);
});

/**
 * POST /api/v1/auth/resend-otp
 * Resends the OTP to the given email.
 * Always returns 200 to avoid email enumeration.
 */
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await userService.resendOtp(email);

  new ApiResponse(
    StatusCodes.OK,
    'If an unverified account exists for this email, a new OTP has been sent.',
  ).send(res);
});

module.exports = { signup, verifyEmail, resendOtp };
