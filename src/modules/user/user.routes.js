'use strict';

const { Router }    = require('express');
const controller    = require('./user.controller');
const { validate, signupSchema, verifyEmailSchema, resendOtpSchema } = require('./user.validator');
const { signupLimiter, otpLimiter } = require('../../middlewares/rateLimiter');

const router = Router();

/**
 * @route  POST /api/v1/auth/signup
 * @desc   Register a new user — sends OTP to provided email
 * @access Public
 */
router.post(
  '/signup',
  signupLimiter,
  validate(signupSchema),
  controller.signup,
);

/**
 * @route  POST /api/v1/auth/verify-email
 * @desc   Verify email address with OTP
 * @access Public
 */
router.post(
  '/verify-email',
  otpLimiter,
  validate(verifyEmailSchema),
  controller.verifyEmail,
);

/**
 * @route  POST /api/v1/auth/resend-otp
 * @desc   Resend OTP to email (rate-limited)
 * @access Public
 */
router.post(
  '/resend-otp',
  otpLimiter,
  validate(resendOtpSchema),
  controller.resendOtp,
);

module.exports = router;
