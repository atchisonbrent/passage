const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { removeProfile } = require('../scripts/browser-profile.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'passage-profile-test-'));
const profile = path.join(dir, 'Default');
fs.mkdirSync(profile);
const original = fs.rmdirSync;
fs.writeFileSync(path.join(profile, 'existing'), 'initial');
let injected = false,
  attempts = 0;
fs.rmdirSync = function (target, ...args) {
  if (String(target) === profile && ++attempts === 2) {
    injected = true;
    fs.writeFileSync(path.join(profile, 'late-chrome-write'), 'flushed');
  }
  return original.call(this, target, ...args);
};
(async () => {
  try {
    await removeProfile(dir);
    assert.equal(injected, true, 'fixture must inject the late profile write');
    assert.equal(fs.existsSync(dir), false, 'profile must be removed after the write race');
    await removeProfile(dir); // absent profile is safe
  } finally {
    fs.rmdirSync = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const originalRm = fs.rmSync;
  try {
    let attempts = 0;
    fs.rmSync = () => {
      attempts++;
      throw Object.assign(new Error('busy'), { code: 'ENOTEMPTY' });
    };
    await assert.rejects(removeProfile(dir), { code: 'ENOTEMPTY' });
    assert.equal(attempts, 6, 'retry budget must be bounded');
    attempts = 0;
    fs.rmSync = () => {
      attempts++;
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    };
    await assert.rejects(removeProfile(dir), { code: 'EACCES' });
    assert.equal(attempts, 1, 'other failures must not be hidden');
  } finally {
    fs.rmSync = originalRm;
  }
  console.log('browser profile cleanup: late-write ENOTEMPTY recovered and absent directory safe');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
