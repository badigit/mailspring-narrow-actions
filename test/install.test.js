'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('installer replaces stale active status and verifies the installed files', {
  skip: process.platform !== 'win32', timeout: 20000,
}, () => {
  const packages = fs.mkdtempSync(path.join(os.tmpdir(), 'narrow-actions-install-'));
  try {
    const destination = path.join(packages, 'narrow-thread-actions');
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, 'status.json'), JSON.stringify({
      state: 'active', version: 'old', updatedAt: '2000-01-01T00:00:00Z',
    }));
    const repo = path.join(__dirname, '..');
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'install.ps1'),
      '-PackagesPath', packages,
    ], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const status = JSON.parse(fs.readFileSync(path.join(destination, 'status.json'), 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(status.state, 'installed');
    assert.equal(status.version, require('../package.json').version);
    assert.ok(Date.parse(status.updatedAt) > Date.parse('2000-01-01T00:00:00Z'));
    for (const relative of ['package.json', 'lib/entry.js', 'lib/main.js', 'lib/notification-trash.js', 'styles/main.less']) {
      assert.deepEqual(fs.readFileSync(path.join(destination, relative)), fs.readFileSync(path.join(repo, relative)));
    }
  } finally {
    fs.rmSync(packages, { recursive: true, force: true });
  }
});
