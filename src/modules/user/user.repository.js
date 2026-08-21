'use strict';

const User = require('./user.model');

/**
 * Data-access layer — all DB operations live here.
 * Service layer MUST NOT import mongoose or User model directly.
 */

/**
 * Creates a new user document.
 * @param {object} data
 * @returns {Promise<User>}
 */
const createUser = (data) => User.create(data);

/**
 * Finds a user by email (active users only by default).
 * @param {string}  email
 * @param {object}  [projection={}]
 * @returns {Promise<User|null>}
 */
const findByEmail = (email, projection = {}) =>
  User.findOne({ email: email.toLowerCase(), deletedAt: null }, projection);

/**
 * Finds a user by ID.
 * @param {string}  id
 * @param {object}  [projection={}]
 * @returns {Promise<User|null>}
 */
const findById = (id, projection = {}) =>
  User.findOne({ _id: id, deletedAt: null }, projection);

/**
 * Finds a user by email including sensitive OTP fields.
 * Used during verification flow.
 * @param {string} email
 * @returns {Promise<User|null>}
 */
const findByEmailWithOtp = (email) =>
  User.findOne({ email: email.toLowerCase(), deletedAt: null }).select(
    '+emailOtp',
  );

/**
 * Updates a user document by ID.
 * Returns the updated document.
 * @param {string} id
 * @param {object} update
 * @returns {Promise<User|null>}
 */
const updateById = (id, update) =>
  User.findOneAndUpdate({ _id: id, deletedAt: null }, update, {
    new: true,
    runValidators: true,
  });

/**
 * Soft-deletes a user by setting deletedAt.
 * @param {string} id
 * @returns {Promise<User|null>}
 */
const softDeleteById = (id) =>
  User.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true },
  );

/**
 * Returns a count of unverified users older than the given date.
 * Used by the cleanup job.
 * @param {Date} olderThan
 * @returns {Promise<number>}
 */
const countUnverifiedOlderThan = (olderThan) =>
  User.countDocuments({
    status:    'pending_verification',
    createdAt: { $lt: olderThan },
    deletedAt: null,
  });

/**
 * Permanently deletes unverified users older than the given date.
 * Called by the cleanup cron job.
 * @param {Date} olderThan
 * @returns {Promise<mongoose.mongo.DeleteResult>}
 */
const deleteUnverifiedOlderThan = (olderThan) =>
  User.deleteMany({
    status:    'pending_verification',
    createdAt: { $lt: olderThan },
    deletedAt: null,
  });

module.exports = {
  createUser,
  findByEmail,
  findById,
  findByEmailWithOtp,
  updateById,
  softDeleteById,
  countUnverifiedOlderThan,
  deleteUnverifiedOlderThan,
};
