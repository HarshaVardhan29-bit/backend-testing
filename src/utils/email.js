'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');
const env = require('../config/env');

// ── Transporter (singleton) ──────────────────────────────────────────────────
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   env.SMTP_HOST,
      port:   env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      pool: true,           // Reuse SMTP connections
      maxConnections: 5,
      maxMessages: 100,
    });
  }
  return transporter;
};

/**
 * Verifies SMTP connectivity — called at startup.
 */
const verifyEmailConnection = async () => {
  try {
    await getTransporter().verify();
    logger.info('SMTP transporter ready');
  } catch (error) {
    logger.warn('SMTP transporter verification failed — emails may not send', {
      error: error.message,
    });
    // Non-fatal: app continues but emails won't work
  }
};

// ── Email templates ──────────────────────────────────────────────────────────

/**
 * Builds the OTP verification email HTML.
 * @param {string} firstName
 * @param {string} otp
 * @param {number} expiryMinutes
 */
const buildOtpEmailHtml = (firstName, otp, expiryMinutes) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#4F46E5;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">
                Email Verification
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151;font-size:16px;margin:0 0 16px;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="color:#374151;font-size:16px;margin:0 0 24px;">
                Thank you for signing up! Use the OTP below to verify your email address.
              </p>

              <!-- OTP Box -->
              <div style="background:#F3F4F6;border-radius:8px;padding:24px;
                          text-align:center;margin:0 0 24px;">
                <span style="font-size:40px;font-weight:700;letter-spacing:12px;
                             color:#4F46E5;font-family:monospace;">
                  ${otp}
                </span>
              </div>

              <p style="color:#6B7280;font-size:14px;margin:0 0 8px;">
                ⏱ This OTP expires in <strong>${expiryMinutes} minutes</strong>.
              </p>
              <p style="color:#6B7280;font-size:14px;margin:0;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;padding:20px 40px;text-align:center;
                       border-top:1px solid #E5E7EB;">
              <p style="color:#9CA3AF;font-size:12px;margin:0;">
                This is an automated message — please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends an OTP verification email.
 * @param {object} options
 * @param {string} options.to          - Recipient email
 * @param {string} options.firstName   - Recipient first name
 * @param {string} options.otp         - 6-digit OTP
 */
const sendOtpEmail = async ({ to, firstName, otp }) => {
  const subject = 'Verify your email address';
  const html = buildOtpEmailHtml(firstName, otp, env.OTP_EXPIRY_MINUTES);

  const info = await getTransporter().sendMail({
    from:    env.EMAIL_FROM,
    to,
    subject,
    html,
    text: `Hi ${firstName}, your verification OTP is: ${otp}. It expires in ${env.OTP_EXPIRY_MINUTES} minutes.`,
  });

  logger.info('OTP email sent', { messageId: info.messageId, to });
  return info;
};

module.exports = { sendOtpEmail, verifyEmailConnection };
