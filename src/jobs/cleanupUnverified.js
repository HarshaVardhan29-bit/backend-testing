'use strict';

const cron     = require('node-cron');
const logger   = require('../config/logger');
const env      = require('../config/env');
const userRepo = require('../modules/user/user.repository');

/**
 * Cleanup job: permanently removes user accounts that:
 *  - Have status = 'pending_verification'
 *  - Were created more than UNVERIFIED_ACCOUNT_TTL_HOURS ago
 *
 * This prevents the DB from accumulating ghost accounts from
 * users who signed up but never verified their email.
 */
const runCleanup = async () => {
  const cutoff = new Date(
    Date.now() - env.UNVERIFIED_ACCOUNT_TTL_HOURS * 60 * 60 * 1000,
  );

  try {
    // Count first for logging visibility
    const count = await userRepo.countUnverifiedOlderThan(cutoff);

    if (count === 0) {
      logger.debug('Cleanup job: no stale unverified accounts found');
      return;
    }

    const result = await userRepo.deleteUnverifiedOlderThan(cutoff);

    logger.info('Cleanup job: removed stale unverified accounts', {
      deleted:  result.deletedCount,
      olderThan: cutoff.toISOString(),
    });
  } catch (error) {
    logger.error('Cleanup job failed', { error: error.message });
  }
};

/**
 * Registers the cleanup cron job.
 * Schedule is controlled by CLEANUP_CRON_SCHEDULE env var (default: every hour).
 */
const registerCleanupJob = () => {
  if (!cron.validate(env.CLEANUP_CRON_SCHEDULE)) {
    logger.error('Invalid CLEANUP_CRON_SCHEDULE — cleanup job not registered', {
      schedule: env.CLEANUP_CRON_SCHEDULE,
    });
    return;
  }

  cron.schedule(env.CLEANUP_CRON_SCHEDULE, runCleanup, {
    name:     'cleanup-unverified-users',
    timezone: 'UTC',
  });

  logger.info('Cleanup cron job registered', {
    schedule: env.CLEANUP_CRON_SCHEDULE,
    ttlHours: env.UNVERIFIED_ACCOUNT_TTL_HOURS,
  });
};

module.exports = { registerCleanupJob, runCleanup };
