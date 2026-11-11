import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('npm tarball contains runnable entries, declarations, license, and public docs', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtfs-tts-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      process.platform === 'win32' ? `"${root}"` : root,
    ],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 60000,
      env: { ...process.env, npm_config_cache: path.join(root, 'cache') },
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  const [packed] = Array.isArray(data) ? data : Object.values(data);
  const paths = packed.files.map(({ path: filename }) => filename);
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE.txt',
    'CHANGELOG.md',
    'config-sample.json',
    'config-sample-full.json',
    'docs/images/gtfs-tts-logo.svg',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/bin/gtfs-tts.js',
  ]) {
    assert.ok(paths.includes(required), `Missing ${required}`);
  }
  assert.ok(paths.some((filename) => /^dist\/terminal-.*\.js$/.test(filename)));
  assert.ok(
    paths.every((filename) => !/^(?:src|test|node_modules)\//.test(filename)),
  );
  assert.ok(!paths.includes('config.json'));
  assert.ok(paths.every((filename) => !filename.includes('.DS_Store')));
});
