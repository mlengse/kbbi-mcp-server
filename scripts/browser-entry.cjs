/**
 * Browser entry point for dist/browser/id.js
 * Exports Hypher engine and Indonesian patterns as a global IIFE.
 */
var Hypher = require('hypher');
var patterns = require('../pattern/id.cjs');

module.exports = { Hypher: Hypher, patterns: patterns };
