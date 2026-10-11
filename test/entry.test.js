'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadEntry({ activationError, writeError } = {}) {
  const writes = [];
  const warnings = [];
  let deactivated = false;
  const exports = {};
  const plugin = {
    activate() { if (activationError) throw activationError; },
    deactivate() { deactivated = true; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/entry.js'), 'utf8'), {
    exports, __dirname: '/installed/plugin/lib', Date,
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'fs') return { writeFileSync(file, text) {
        if (writeError) throw writeError;
        writes.push({ file, status: JSON.parse(text) });
      } };
      if (name === 'path') return path;
      if (name === './main') return plugin;
      if (name === '../package.json') return { version: '1.0.3' };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { timeout: 1000 });
  return { exports, writes, warnings, isDeactivated: () => deactivated };
}

test('activation failure writes failed status and preserves the original error', () => {
  const error = new Error('Registry unavailable');
  const entry = loadEntry({ activationError: error });
  assert.throws(() => entry.exports.activate(), (actual) => actual === error);
  assert.equal(entry.writes[0].status.state, 'failed');
  assert.equal(entry.writes[0].status.error, error.message);
  assert.equal(entry.writes[0].status.version, '1.0.3');
  assert.ok(Number.isFinite(Date.parse(entry.writes[0].status.updatedAt)));
});

test('successful activation and deactivation write fresh status', () => {
  const entry = loadEntry();
  entry.exports.activate();
  assert.equal(entry.writes[0].status.state, 'active');
  entry.exports.deactivate();
  assert.equal(entry.isDeactivated(), true);
  assert.equal(entry.writes[1].status.state, 'inactive');
});

test('status write failures do not mask an activation error or stop activation', () => {
  const error = new Error('Activation failed');
  const entry = loadEntry({ activationError: error, writeError: new Error('Read-only directory') });
  assert.throws(() => entry.exports.activate(), (actual) => actual === error);
  assert.equal(entry.warnings.length, 1);
  const successful = loadEntry({ writeError: new Error('Read-only directory') });
  assert.doesNotThrow(() => successful.exports.activate());
  assert.equal(successful.warnings.length, 1);
});
