import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('public package exports only the named review API without global side effects', async () => {
  const before = process.listeners('uncaughtException');
  const api = await import('gtfs-tts');
  assert.deepEqual(Object.keys(api), ['reviewGtfs']);
  assert.deepEqual(process.listeners('uncaughtException'), before);
  await assert.rejects(import('gtfs-tts/dist/index.js'), {
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  });
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  assert.deepEqual(manifest.dependencies, { gtfs: '5.0.0-beta.0' });
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.bin['gtfs-tts'], 'dist/bin/gtfs-tts.js');
  assert.ok(
    (await readFile(manifest.bin['gtfs-tts'], 'utf8')).startsWith(
      '#!/usr/bin/env node',
    ),
  );
});
