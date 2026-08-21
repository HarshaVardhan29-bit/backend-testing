'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const emailOtpSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      select: false,   // Never returned in queries by default
    },
    expiresAt: {
      type: Date,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
    },
  },
  { _id: false },
);

const metadataSchema = new mongoose.Schema(
  {
    ipAddress:    { type: String },
    userAgent:    { type: String },
    signupSource: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'api',
    },
  },
  { _id: false },
);

// ── Main User Schema ─────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [2, 'First name must be at least 2 characters'],
      maxlength: [50, 'First name must not exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [2, 'Last name must be at least 2 characters'],
      maxlength: [50, 'Last name must not exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format e.g. +919876543210'],
      sparse: true,   // Allow multiple nulls in unique index
    },

    // ── Credentials ───────────────────────────────────────────────────────────
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,   // Never returned in queries by default
    },

    // ── Access Control ────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ['user', 'admin', 'moderator'],
      default: 'user',
    },
    status: {
      type: String,
      enum: ['pending_verification', 'active', 'suspended', 'deactivated'],
      default: 'pending_verification',
    },

    // ── Email Verification ────────────────────────────────────────────────────
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailOtp: {
      type: emailOtpSchema,
      select: false,   // Never returned in queries by default
    },

    // ── Audit / Metadata ──────────────────────────────────────────────────────
    metadata: {
      type: metadataSchema,
      default: {},
    },

    // ── Soft Delete ───────────────────────────────────────────────────────────
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,     // Adds createdAt & updatedAt
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.password;
        delete ret.emailOtp;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ── Virtuals ─────────────────────────────────────────────────────────────────

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Indexes ───────────────────────────────────────────────────────────────────

userSchema.index({ email: 1, deletedAt: 1 });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ createdAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { status: 'pending_verification' } });

// ── Pre-save hook: hash password ─────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// ── Instance methods ─────────────────────────────────────────────────────────

/**
 * Compares a plain-text password against the stored hash.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Returns a safe public profile (no sensitive fields).
 * @returns {object}
 */
userSchema.methods.toPublicProfile = function () {
  return {
    id:            this._id,
    firstName:     this.firstName,
    lastName:      this.lastName,
    fullName:      this.fullName,
    email:         this.email,
    phone:         this.phone,
    role:          this.role,
    status:        this.status,
    emailVerified: this.emailVerified,
    createdAt:     this.createdAt,
  };
};

const User = mongoose.model('User', userSchema);

module.exports = User;
