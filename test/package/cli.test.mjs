import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { parseFlags } from '../../src/cli/options.ts';
import { loadConfig } from '../../src/cli/config.ts';

const bin = path.resolve('dist/bin/gtfs-tts.js');

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtfs-tts-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function run(cwd, ...args) {
  const env = { ...process.env };
  if (env.FORCE_COLOR !== undefined) {
    delete env.NO_COLOR;
  }
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  return {
    ...result,
    stdout: stripVTControlCharacters(result.stdout),
    stderr: stripVTControlCharacters(result.stderr),
  };
}

test('CLI help and version work without a config or terminal', async (t) => {
  const root = await temporary(t);
  for (const args of [[], ['--help'], ['review', '--help']]) {
    const result = run(root, ...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: gtfs-tts \[options\]/);
    assert.equal(result.stderr, '');
  }
  const result = run(root, '--version');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^\d+\.\d+\.\d+/);
});

test('CLI errors are concise, nonzero, and only go to stderr', async (t) => {
  const root = await temporary(t);
  for (const [args, pattern] of [
    [['unknown'], /Unknown command/],
    [['review', '--configPath', 'x'], /removed; use --config/],
    [['review', '--typo'], /Unknown option/],
    [['review', '--input', 'x', '--url', 'https://example.com'], /not both/],
    [['review', '--input', 'x', '--from-database'], /cannot be combined/],
    [['review', '--log-level', 'warning'], /must be/],
    [['review', '--config', 'missing'], /Cannot read configuration/],
    [['review'], /No configuration file/],
    [['review', '--input', 'feed'], /requires a terminal/],
  ]) {
    const result = run(root, ...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
    assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  }
});

test('malformed config gets a specific error before any review', async (t) => {
  const root = await temporary(t);
  for (const [content, pattern] of [
    ['{', /Invalid JSON/],
    ['null', /must be an object/],
    ['[]', /must be an object/],
    ['{"review":null}', /review must be an object/],
    ['{"gtfsPath":"feed"}', /was removed/],
  ]) {
    await writeFile(path.join(root, 'config.json'), content);
    const result = run(root, 'review');
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
  }
});

test('CLI overrides replace direct inputs and merge review/export/reporting settings', async (t) => {
  const root = await temporary(t);
  const filename = path.join(root, 'config.json');
  const original = {
    database: { path: 'old.sqlite', durability: 'fast' },
    sources: [
      {
        sourceId: 'old',
        schedule: { url: 'https://example.com', timeoutMs: 3000 },
      },
    ],
    review: { sourceId: 'old', input: 'database', flaggedStopName: 'FIX' },
    export: { outputDirectory: 'old', batchSize: 123 },
    reporting: { level: 'silent' },
  };
  await writeFile(filename, JSON.stringify(original));
  const config = await loadConfig(
    parseFlags([
      '--config',
      filename,
      '--input',
      'feed',
      '--source-id',
      'new',
      '--database',
      'new.sqlite',
      '--output',
      'out',
      '--overwrite',
      '--log-level',
      'warn',
    ]),
  );
  assert.deepEqual(config.database, { path: 'new.sqlite' });
  assert.deepEqual(config.sources, [
    { sourceId: 'new', schedule: { path: 'feed' } },
  ]);
  assert.deepEqual(config.review, {
    sourceId: 'new',
    input: 'schedule',
    flaggedStopName: 'FIX',
  });
  assert.deepEqual(config.export, {
    outputDirectory: 'out',
    batchSize: 123,
    overwrite: true,
  });
  assert.deepEqual(config.reporting, { level: 'warn' });
  const stored = await loadConfig(
    parseFlags(['--config', filename, '--from-database']),
  );
  assert.equal(stored.review.input, 'database');
  assert.deepEqual(stored.sources, original.sources);
});

test('direct input and config flags reach review without a subcommand', async (t) => {
  const root = await temporary(t);
  const filename = path.join(root, 'config.json');
  await writeFile(
    filename,
    JSON.stringify({
      database: { path: ':memory:' },
      sources: [{ schedule: { path: 'feed' } }],
    }),
  );
  for (const args of [
    ['--input', 'feed'],
    ['--config', filename],
    ['-c', filename],
  ]) {
    const result = run(root, ...args);
    assert.equal(result.status, 1);
    // The subprocess has no TTY: reaching this error proves routing and config succeeded.
    assert.match(result.stderr, /Interactive review requires a terminal/);
    assert.doesNotMatch(result.stderr, /Unknown command/);
  }
});
