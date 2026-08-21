'use strict';

/**
 * tests/setup.js
 *
 * Loaded by Mocha via --require before any test file runs.
 * Loads the test .env so envalid is satisfied without needing
 * a real .env file (which has placeholder values).
 */
require('dotenv').config({ path: `${__dirname}/.env.test` });
