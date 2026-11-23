import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

test('installed tarball runs the CLI and reviews a fixture feed', async (t) => {
  const consumer = await mkdtemp(path.join(tmpdir(), 'gtfs-tts-consumer-'));
  t.after(() => rm(consumer, { recursive: true, force: true }));
  const windows = process.platform === 'win32';
  function npm(args) {
    return execFileSync(windows ? 'npm.cmd' : 'npm', args, {
      cwd: consumer,
      shell: windows,
      encoding: 'utf8',
    });
  }

  await writeFile(path.join(consumer, 'package.json'), '{"private":true}');
  const project = path.resolve('.');
  const [packed] = Object.values(
    JSON.parse(
      npm([
        'pack',
        '--ignore-scripts',
        '--json',
        windows ? `"${project}"` : project,
      ]),
    ),
  );
  npm([
    'install',
    '--engine-strict',
    '--no-audit',
    '--no-fund',
    packed.filename,
  ]);
  assert.equal(
    npm(['exec', '--offline', '--', 'gtfs-tts', '--version']).trim(),
    packed.version,
  );

  const entry = path.join(consumer, 'review.mjs');
  await writeFile(entry, "export { reviewGtfs } from 'gtfs-tts';");
  const { reviewGtfs } = await import(pathToFileURL(entry).href);
  const result = await reviewGtfs(
    {
      database: { path: ':memory:' },
      sources: [{ schedule: { path: path.resolve('test/fixtures/feed') } }],
      export: { outputDirectory: path.join(consumer, 'output') },
      reporting: { level: 'silent' },
    },
    { reviewStop: () => 'incorrect' },
  );
  assert.equal(result.reviewedStops, 3);
  assert.equal(result.flaggedStops, 3);
  const stops = await readFile(
    path.join(result.outputDirectory, 'stops.txt'),
    'utf8',
  );
  assert.match(stops, /First St,\*\*\*NEEDS VALUE\*\*\*/);
});
