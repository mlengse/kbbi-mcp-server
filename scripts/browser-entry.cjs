/**
 * Browser entry point for dist/browser/id.js
 * Exports Hypher engine and Indonesian patterns as a global IIFE.
 */
var Hypher = require('hypher');
var patterns = require('../patterns/id.cjs');

module.exports = { Hypher: Hypher, patterns: patterns };
