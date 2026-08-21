'use strict';

/**
 * tests/unit/user/user.service.test.js
 *
 * Pure unit tests for src/modules/user/user.service.js
 *
 * Strategy:
 *  - proxyquire rewires all require() calls inside the service at load time,
 *    so even destructured bindings (e.g. `const { sendOtpEmail } = require(...)`)
 *    are intercepted by our sinon stubs.
 *  - No real DB, SMTP, filesystem, or network calls are made.
 *  - sinon.restore() in afterEach prevents stub state leaking between tests.
 */

const { expect } = require('chai');
const sinon      = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

// ─────────────────────────────────────────────────────────────────────────────
//  Stub objects (created once, reset per test)
// ─────────────────────────────────────────────────────────────────────────────

const userRepoStub  = {};
const emailStub     = {};
const loggerStub    = { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} };

// Load the service with all its deps replaced by our stubs
const userService = proxyquire('../../../src/modules/user/user.service', {
  './user.repository':    userRepoStub,
  '../../utils/email':    emailStub,
  '../../config/logger':  loggerStub,
});

// ─────────────────────────────────────────────────────────────────────────────
//  Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_SIGNUP_DATA = {
  firstName:    'John',
  lastName:     'Doe',
  email:        'john@example.com',
  password:     'P@ssword123',
  phone:        '+919876543210',
  signupSource: 'web',
};

const META = { ipAddress: '127.0.0.1', userAgent: 'TestAgent/1.0' };

/**
 * Builds a minimal fake Mongoose user document.
 */
const makeFakeUser = (overrides = {}) => ({
  _id:           'user-id-001',
  firstName:     'John',
  lastName:      'Doe',
  email:         'john@example.com',
  emailVerified: false,
  status:        'pending_verification',
  role:          'user',
  createdAt:     new Date(),
  toPublicProfile() {
    return {
      id:            this._id,
      firstName:     this.firstName,
      lastName:      this.lastName,
      email:         this.email,
      emailVerified: this.emailVerified,
      status:        this.status,
      role:          this.role,
    };
  },
  ...overrides,
});

/**
 * Builds a fake user with OTP sub-document (simulates findByEmailWithOtp).
 */
const makeFakeUserWithOtp = (otpOverrides = {}, userOverrides = {}) => {
  const now = new Date();
  return makeFakeUser({
    emailOtp: {
      code:       '482910',
      expiresAt:  new Date(now.getTime() + 10 * 60 * 1000), // +10 min (valid)
      attempts:   0,
      lastSentAt: new Date(now.getTime() - 120 * 1000),     // -2 min (past cooldown)
      ...otpOverrides,
    },
    ...userOverrides,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
//  signup()
// ─────────────────────────────────────────────────────────────────────────────

describe('userService.signup()', () => {
  beforeEach(() => {
    userRepoStub.findByEmail  = sinon.stub().resolves(null);
    userRepoStub.createUser   = sinon.stub().resolves(makeFakeUser());
    emailStub.sendOtpEmail    = sinon.stub().resolves();
    loggerStub.info           = sinon.stub();
    loggerStub.error          = sinon.stub();
  });

  afterEach(() => {
    // Reset each stub individually — do NOT call sinon.restore() which
    // would delete the properties proxyquire wired into emailStub/userRepoStub.
    [userRepoStub.findByEmail, userRepoStub.createUser,
     emailStub.sendOtpEmail, loggerStub.info, loggerStub.error]
      .forEach((s) => s && s.resetHistory && s.resetHistory());
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('should create a new user and return the public profile', async () => {
    const result = await userService.signup(VALID_SIGNUP_DATA, META);

    expect(result).to.deep.include({
      email:         'john@example.com',
      emailVerified: false,
      status:        'pending_verification',
    });
  });

  it('should call userRepo.createUser once', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);
    sinon.assert.calledOnce(userRepoStub.createUser);
  });

  it('should pass correct identity fields to createUser', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    const arg = userRepoStub.createUser.firstCall.args[0];
    expect(arg).to.include({
      firstName: 'John',
      lastName:  'Doe',
      email:     'john@example.com',
      password:  'P@ssword123',
      phone:     '+919876543210',
    });
  });

  it('should pass correct metadata to createUser', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    const { metadata } = userRepoStub.createUser.firstCall.args[0];
    expect(metadata).to.deep.include({
      ipAddress:    '127.0.0.1',
      userAgent:    'TestAgent/1.0',
      signupSource: 'web',
    });
  });

  it('should store a 6-digit numeric OTP string in emailOtp.code', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    const { emailOtp } = userRepoStub.createUser.firstCall.args[0];
    expect(emailOtp.code).to.match(/^\d{6}$/);
  });

  it('should store an OTP expiry date in the future', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    const { emailOtp } = userRepoStub.createUser.firstCall.args[0];
    expect(emailOtp.expiresAt).to.be.instanceOf(Date);
    expect(emailOtp.expiresAt.getTime()).to.be.above(Date.now());
  });

  it('should initialise OTP attempts to 0', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    const { emailOtp } = userRepoStub.createUser.firstCall.args[0];
    expect(emailOtp.attempts).to.equal(0);
  });

  it('should send an OTP email to the registered address', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    sinon.assert.calledOnce(emailStub.sendOtpEmail);
    const emailArg = emailStub.sendOtpEmail.firstCall.args[0];
    expect(emailArg.to).to.equal('john@example.com');
    expect(emailArg.firstName).to.equal('John');
    expect(emailArg.otp).to.match(/^\d{6}$/);
  });

  it('should send the same OTP to the email as was saved to the DB', async () => {
    await userService.signup(VALID_SIGNUP_DATA, META);

    const savedOtp = userRepoStub.createUser.firstCall.args[0].emailOtp.code;
    const sentOtp  = emailStub.sendOtpEmail.firstCall.args[0].otp;
    expect(sentOtp).to.equal(savedOtp);
  });

  it('should default signupSource to "api" when not provided', async () => {
    const data = { ...VALID_SIGNUP_DATA };
    delete data.signupSource;
    await userService.signup(data, META);

    const { metadata } = userRepoStub.createUser.firstCall.args[0];
    expect(metadata.signupSource).to.equal('api');
  });

  it('should omit phone when not provided', async () => {
    const data = { ...VALID_SIGNUP_DATA };
    delete data.phone;
    await userService.signup(data, META);

    const arg = userRepoStub.createUser.firstCall.args[0];
    expect(arg.phone).to.be.undefined;
  });

  it('should still succeed (swallow error) when sendOtpEmail throws', async () => {
    emailStub.sendOtpEmail = sinon.stub().rejects(new Error('SMTP refused'));

    const result = await userService.signup(VALID_SIGNUP_DATA, META);
    expect(result).to.have.property('email', 'john@example.com');
  });

  it('should log the email failure when sendOtpEmail throws', async () => {
    emailStub.sendOtpEmail = sinon.stub().rejects(new Error('SMTP refused'));

    await userService.signup(VALID_SIGNUP_DATA, META);
    sinon.assert.calledWithMatch(loggerStub.error, 'Failed to send OTP email after signup');
  });

  it('should generate OTPs in the range [100000, 999999]', async () => {
    const codes = [];
    userRepoStub.createUser = sinon.stub().callsFake((data) => {
      codes.push(parseInt(data.emailOtp.code, 10));
      return Promise.resolve(makeFakeUser());
    });

    for (let i = 0; i < 10; i++) {
      await userService.signup({ ...VALID_SIGNUP_DATA, email: `user${i}@test.com` }, META);
    }

    codes.forEach((c) => {
      expect(c).to.be.at.least(100000);
      expect(c).to.be.at.most(999999);
    });
  });

  // ── Conflict: verified email ─────────────────────────────────────────────

  it('should throw 409 when the email is already registered and verified', async () => {
    userRepoStub.findByEmail = sinon.stub().resolves(makeFakeUser({ emailVerified: true }));

    try {
      await userService.signup(VALID_SIGNUP_DATA, META);
      expect.fail('Expected ApiError');
    } catch (err) {
      expect(err.statusCode).to.equal(409);
      expect(err.message).to.equal('An account with this email already exists');
    }
  });

  it('should throw 409 when the email exists but is unverified', async () => {
    userRepoStub.findByEmail = sinon.stub().resolves(makeFakeUser({ emailVerified: false }));

    try {
      await userService.signup(VALID_SIGNUP_DATA, META);
      expect.fail('Expected ApiError');
    } catch (err) {
      expect(err.statusCode).to.equal(409);
      expect(err.message).to.include('An unverified account exists');
    }
  });

  it('should NOT call createUser when email already exists', async () => {
    userRepoStub.findByEmail = sinon.stub().resolves(makeFakeUser({ emailVerified: true }));

    try { await userService.signup(VALID_SIGNUP_DATA, META); } catch (_) {}
    sinon.assert.notCalled(userRepoStub.createUser);
  });

  it('should NOT send email when email already exists', async () => {
    userRepoStub.findByEmail = sinon.stub().resolves(makeFakeUser({ emailVerified: true }));

    try { await userService.signup(VALID_SIGNUP_DATA, META); } catch (_) {}
    sinon.assert.notCalled(emailStub.sendOtpEmail);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  verifyEmail()
// ─────────────────────────────────────────────────────────────────────────────

describe('userService.verifyEmail()', () => {
  const EMAIL     = 'john@example.com';
  const VALID_OTP = '482910';

  beforeEach(() => {
    loggerStub.info  = sinon.stub();
    loggerStub.error = sinon.stub();
    userRepoStub.findByEmailWithOtp = sinon.stub();
    userRepoStub.updateById         = sinon.stub();
  });

  afterEach(() => {
    [userRepoStub.findByEmailWithOtp, userRepoStub.updateById,
     loggerStub.info, loggerStub.error]
      .forEach((s) => s && s.resetHistory && s.resetHistory());
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('should return the activated public profile on correct OTP', async () => {
    const fakeUser   = makeFakeUserWithOtp({ code: VALID_OTP });
    const activeUser = makeFakeUser({ emailVerified: true, status: 'active' });

    userRepoStub.findByEmailWithOtp.resolves(fakeUser);
    userRepoStub.updateById.resolves(activeUser);

    const result = await userService.verifyEmail(EMAIL, VALID_OTP);
    expect(result).to.deep.include({ emailVerified: true, status: 'active' });
  });

  it('should call updateById twice: once to increment attempts, once to activate', async () => {
    const fakeUser   = makeFakeUserWithOtp({ code: VALID_OTP });
    const activeUser = makeFakeUser({ emailVerified: true, status: 'active' });

    userRepoStub.findByEmailWithOtp.resolves(fakeUser);
    userRepoStub.updateById.resolves(activeUser);

    await userService.verifyEmail(EMAIL, VALID_OTP);
    sinon.assert.calledTwice(userRepoStub.updateById);
  });

  it('should increment attempts counter on first updateById call', async () => {
    const fakeUser   = makeFakeUserWithOtp({ code: VALID_OTP });
    const activeUser = makeFakeUser({ emailVerified: true, status: 'active' });

    userRepoStub.findByEmailWithOtp.resolves(fakeUser);
    userRepoStub.updateById.resolves(activeUser);

    await userService.verifyEmail(EMAIL, VALID_OTP);

    const firstPayload = userRepoStub.updateById.firstCall.args[1];
    expect(firstPayload).to.deep.equal({ $inc: { 'emailOtp.attempts': 1 } });
  });

  it('should activate the account on the second updateById call', async () => {
    const fakeUser   = makeFakeUserWithOtp({ code: VALID_OTP });
    const activeUser = makeFakeUser({ emailVerified: true, status: 'active' });

    userRepoStub.findByEmailWithOtp.resolves(fakeUser);
    userRepoStub.updateById.resolves(activeUser);

    await userService.verifyEmail(EMAIL, VALID_OTP);

    const lastPayload = userRepoStub.updateById.lastCall.args[1];
    expect(lastPayload).to.deep.include({ emailVerified: true, status: 'active' });
    expect(lastPayload).to.have.property('$unset').that.deep.includes({ emailOtp: '' });
  });

  it('should pass the correct user ID to both updateById calls', async () => {
    const fakeUser   = makeFakeUserWithOtp({ code: VALID_OTP });
    const activeUser = makeFakeUser({ emailVerified: true, status: 'active' });

    userRepoStub.findByEmailWithOtp.resolves(fakeUser);
    userRepoStub.updateById.resolves(activeUser);

    await userService.verifyEmail(EMAIL, VALID_OTP);

    expect(userRepoStub.updateById.firstCall.args[0]).to.equal('user-id-001');
    expect(userRepoStub.updateById.lastCall.args[0]).to.equal('user-id-001');
  });

  // ── Guard: user not found ────────────────────────────────────────────────

  it('should throw 404 when no user exists for the email', async () => {
    userRepoStub.findByEmailWithOtp.resolves(null);

    try {
      await userService.verifyEmail(EMAIL, VALID_OTP);
      expect.fail('Expected ApiError');
    } catch (err) {
      expect(err.statusCode).to.equal(404);
      expect(err.message).to.equal('No account found with this email');
    }
  });

  // ── Guard: already verified ──────────────────────────────────────────────

  it('should throw 400 when the email is already verified', async () => {
    userRepoStub.findByEmailWithOtp.resolves(makeFakeUser({ emailVerified: true }));

    try {
      await userService.verifyEmail(EMAIL, VALID_OTP);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(400);
      expect(err.message).to.equal('This email has already been verified');
    }
  });

  // ── Guard: no OTP stored ─────────────────────────────────────────────────

  it('should throw 400 when no OTP document exists on the user', async () => {
    userRepoStub.findByEmailWithOtp.resolves(makeFakeUser({ emailOtp: null }));

    try {
      await userService.verifyEmail(EMAIL, VALID_OTP);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(400);
      expect(err.message).to.include('No verification OTP found');
    }
  });

  it('should throw 400 when OTP code field is missing from the document', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ code: undefined }),
    );

    try {
      await userService.verifyEmail(EMAIL, VALID_OTP);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(400);
    }
  });

  // ── Guard: max attempts ──────────────────────────────────────────────────

  it('should throw 429 when attempts >= OTP_MAX_ATTEMPTS', async () => {
    const env = require('../../../src/config/env');
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ code: VALID_OTP, attempts: env.OTP_MAX_ATTEMPTS }),
    );

    try {
      await userService.verifyEmail(EMAIL, VALID_OTP);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(429);
      expect(err.message).to.include('Maximum OTP attempts exceeded');
    }
  });

  it('should NOT call updateById when attempt limit is already reached', async () => {
    const env = require('../../../src/config/env');
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ code: VALID_OTP, attempts: env.OTP_MAX_ATTEMPTS }),
    );

    try { await userService.verifyEmail(EMAIL, VALID_OTP); } catch (_) {}
    sinon.assert.notCalled(userRepoStub.updateById);
  });

  // ── Guard: OTP expired ───────────────────────────────────────────────────

  it('should throw 400 when OTP has expired', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({
        code:      VALID_OTP,
        expiresAt: new Date(Date.now() - 1000),   // 1 second in the past
      }),
    );
    userRepoStub.updateById.resolves();

    try {
      await userService.verifyEmail(EMAIL, VALID_OTP);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(400);
      expect(err.message).to.equal('OTP has expired. Please request a new one.');
    }
  });

  // ── Guard: wrong OTP ─────────────────────────────────────────────────────

  it('should throw 400 with remaining attempts when OTP does not match', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ code: '111111', attempts: 1 }),
    );
    userRepoStub.updateById.resolves();

    try {
      await userService.verifyEmail(EMAIL, '999999');
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(400);
      expect(err.message).to.include('Invalid OTP');
      expect(err.message).to.include('remaining');
    }
  });

  it('should use singular "attempt" when exactly 1 attempt is left', async () => {
    const env = require('../../../src/config/env');
    // OTP_MAX_ATTEMPTS - 2 used → 1 remaining after this attempt
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ code: '111111', attempts: env.OTP_MAX_ATTEMPTS - 2 }),
    );
    userRepoStub.updateById.resolves();

    try {
      await userService.verifyEmail(EMAIL, '999999');
      expect.fail();
    } catch (err) {
      expect(err.message).to.include('1 attempt remaining');
    }
  });

  it('should use plural "attempts" when multiple attempts are left', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ code: '111111', attempts: 0 }),
    );
    userRepoStub.updateById.resolves();

    try {
      await userService.verifyEmail(EMAIL, '999999');
      expect.fail();
    } catch (err) {
      expect(err.message).to.include('attempts remaining');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  resendOtp()
// ─────────────────────────────────────────────────────────────────────────────

describe('userService.resendOtp()', () => {
  const EMAIL = 'john@example.com';

  beforeEach(() => {
    loggerStub.info  = sinon.stub();
    loggerStub.error = sinon.stub();
    userRepoStub.findByEmailWithOtp = sinon.stub();
    userRepoStub.updateById         = sinon.stub().resolves();
    emailStub.sendOtpEmail          = sinon.stub().resolves();
  });

  afterEach(() => {
    [userRepoStub.findByEmailWithOtp, userRepoStub.updateById,
     emailStub.sendOtpEmail, loggerStub.info, loggerStub.error]
      .forEach((s) => s && s.resetHistory && s.resetHistory());
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('should call sendOtpEmail with correct arguments', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );

    await userService.resendOtp(EMAIL);

    sinon.assert.calledOnce(emailStub.sendOtpEmail);
    const arg = emailStub.sendOtpEmail.firstCall.args[0];
    expect(arg.to).to.equal(EMAIL);
    expect(arg.firstName).to.equal('John');
    expect(arg.otp).to.match(/^\d{6}$/);
  });

  it('should persist the new OTP to the database', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );

    await userService.resendOtp(EMAIL);

    sinon.assert.calledOnce(userRepoStub.updateById);
    const payload = userRepoStub.updateById.firstCall.args[1];
    expect(payload.emailOtp.code).to.match(/^\d{6}$/);
    expect(payload.emailOtp.attempts).to.equal(0);
  });

  it('should set a fresh OTP expiry in the future', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );

    await userService.resendOtp(EMAIL);

    const payload = userRepoStub.updateById.firstCall.args[1];
    expect(payload.emailOtp.expiresAt).to.be.instanceOf(Date);
    expect(payload.emailOtp.expiresAt.getTime()).to.be.above(Date.now());
  });

  it('should reset the attempt counter to 0 in the saved OTP', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ attempts: 3, lastSentAt: new Date(Date.now() - 120_000) }),
    );

    await userService.resendOtp(EMAIL);

    const payload = userRepoStub.updateById.firstCall.args[1];
    expect(payload.emailOtp.attempts).to.equal(0);
  });

  it('should save the same OTP to the DB as it sends in the email', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );

    await userService.resendOtp(EMAIL);

    const savedOtp = userRepoStub.updateById.firstCall.args[1].emailOtp.code;
    const sentOtp  = emailStub.sendOtpEmail.firstCall.args[0].otp;
    expect(savedOtp).to.equal(sentOtp);
  });

  it('should allow resend once the cooldown window has passed', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );

    await userService.resendOtp(EMAIL);   // Should not throw
    sinon.assert.calledOnce(emailStub.sendOtpEmail);
  });

  it('should allow resend when lastSentAt is null (first-time edge case)', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: null }),
    );

    await userService.resendOtp(EMAIL);
    sinon.assert.calledOnce(emailStub.sendOtpEmail);
  });

  it('should allow resend when user has no emailOtp at all', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUser({ emailOtp: null }),
    );

    await userService.resendOtp(EMAIL);
    sinon.assert.calledOnce(emailStub.sendOtpEmail);
  });

  // ── Security: email enumeration protection ───────────────────────────────

  it('should return silently (undefined) when no user is found', async () => {
    userRepoStub.findByEmailWithOtp.resolves(null);

    const result = await userService.resendOtp(EMAIL);
    expect(result).to.be.undefined;
  });

  it('should not call sendOtpEmail or updateById when no user is found', async () => {
    userRepoStub.findByEmailWithOtp.resolves(null);

    await userService.resendOtp(EMAIL);
    sinon.assert.notCalled(emailStub.sendOtpEmail);
    sinon.assert.notCalled(userRepoStub.updateById);
  });

  // ── Guard: already verified ──────────────────────────────────────────────

  it('should throw 400 when the email is already verified', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({}, { emailVerified: true }),
    );

    try {
      await userService.resendOtp(EMAIL);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(400);
      expect(err.message).to.equal('This email has already been verified');
    }
  });

  // ── Guard: suspended account ─────────────────────────────────────────────

  it('should throw 403 when the account is suspended', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({}, { status: 'suspended' }),
    );

    try {
      await userService.resendOtp(EMAIL);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(403);
      expect(err.message).to.equal('Account is suspended');
    }
  });

  // ── Guard: cooldown ──────────────────────────────────────────────────────

  it('should throw 429 when OTP was sent within the cooldown window', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 10_000) }), // 10s ago
    );

    try {
      await userService.resendOtp(EMAIL);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(429);
      expect(err.message).to.include('Please wait');
      expect(err.message).to.include('second');
    }
  });

  it('should report the remaining wait time accurately in the 429 message', async () => {
    // Sent 10s ago → ~50s remaining (with 60s cooldown)
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 10_000) }),
    );

    try {
      await userService.resendOtp(EMAIL);
      expect.fail();
    } catch (err) {
      const match = err.message.match(/(\d+) second/);
      expect(match).to.not.be.null;
      const seconds = parseInt(match[1], 10);
      expect(seconds).to.be.within(45, 55);
    }
  });

  it('should NOT call sendOtpEmail when cooldown is active', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 5_000) }),
    );

    try { await userService.resendOtp(EMAIL); } catch (_) {}
    sinon.assert.notCalled(emailStub.sendOtpEmail);
  });

  // ── Guard: email send failure ────────────────────────────────────────────

  it('should throw 500 when sendOtpEmail fails (unlike signup, resend propagates error)', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );
    emailStub.sendOtpEmail = sinon.stub().rejects(new Error('SMTP down'));

    try {
      await userService.resendOtp(EMAIL);
      expect.fail();
    } catch (err) {
      expect(err.statusCode).to.equal(500);
      expect(err.message).to.include('Failed to send OTP email');
    }
  });

  it('should log the error before throwing 500 on email failure', async () => {
    userRepoStub.findByEmailWithOtp.resolves(
      makeFakeUserWithOtp({ lastSentAt: new Date(Date.now() - 120_000) }),
    );
    emailStub.sendOtpEmail = sinon.stub().rejects(new Error('timeout'));

    try { await userService.resendOtp(EMAIL); } catch (_) {}
    sinon.assert.calledWithMatch(loggerStub.error, 'Failed to resend OTP email');
  });
});
