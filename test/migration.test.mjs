import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Gtfs } from 'gtfs';
import say from 'say';
import readline from 'readline-sync';
import app from '../dist/index.js';

const feed = path.resolve('test/fixtures/feed');
const extensions = ['gtfs-plus', 'gtfs-ride', 'gtfs-to-html', 'tods-v1'];
const marker = '***NEEDS VALUE***';

function interaction(answers) {
  const spoken = [],
    prompts = [];
  mock.method(say, 'speak', (text) => {
    spoken.push(text);
  });
  mock.method(say, 'stop', () => {});
  mock.method(readline, 'keyIn', (prompt) => {
    prompts.push(prompt);
    assert.ok(answers.length, 'Unexpected extra prompt');
    return answers.shift();
  });
  return { spoken, prompts };
}

test('memory import, review, repeat, early exit and extension export', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtfs-tts-test-'));
  const output = path.join(root, 'output');
  try {
    const observed = interaction(['r', 'y', 'n', 'e']);
    assert.equal(
      await app({ gtfsPath: feed, exportPath: output, verbose: false }),
      undefined,
    );
    assert.deepEqual(observed.spoken, [
      'Second Street',
      'Second Street',
      'First St',
      'Third St',
    ]);
    assert.match(observed.prompts[0], /Stop ID 002/);
    assert.deepEqual(
      (await readdir(output)).sort(),
      (await readdir(feed)).sort(),
    );
    const stops = await readFile(path.join(output, 'stops.txt'), 'utf8');
    assert.match(stops, /001,,First St,\*\*\*NEEDS VALUE\*\*\*/);
    assert.doesNotMatch(stops, /source_id|_unknown_fields/);
  } finally {
    mock.restoreAll();
  }
});

test('persistent reopening isolates overlapping source IDs and preserves edits', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtfs-tts-test-'));
  const sqlitePath = path.join(root, 'v5.sqlite');
  const gtfs = new Gtfs({
    database: { path: sqlitePath },
    extensions,
    sources: [
      { sourceId: 'one', schedule: { path: feed } },
      { sourceId: 'two', schedule: { path: feed } },
    ],
  });
  try {
    assert.equal((await gtfs.import()).success, true);
  } finally {
    await gtfs.close();
  }
  try {
    interaction(['n', 'e']);
    await app({
      sqlitePath,
      sourceId: 'one',
      skipImport: true,
      exportPath: path.join(root, 'output'),
      verbose: false,
    });
    mock.restoreAll();
    const observed = interaction(['e']);
    await app({
      sqlitePath,
      sourceId: 'one',
      skipImport: true,
      exportPath: path.join(root, 'output'),
      verbose: false,
    });
    assert.equal(observed.spoken[0], marker);
  } finally {
    mock.restoreAll();
  }
  const reopened = new Gtfs({ database: { path: sqlitePath }, extensions });
  try {
    assert.equal(
      await reopened.schedule.stops
        .where({ source_id: 'one', tts_stop_name: marker })
        .count(),
      1,
    );
    assert.equal(
      await reopened.schedule.stops
        .where({ source_id: 'two', tts_stop_name: marker })
        .count(),
      0,
    );
  } finally {
    await reopened.close();
  }
});

test('failed import leaves output intact, closes instance and permits retry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtfs-tts-test-'));
  const output = path.join(root, 'output');
  await writeFile(output, 'untouched');
  const closed = mock.method(Gtfs.prototype, 'close');
  try {
    await assert.rejects(
      app({
        gtfsPath: path.join(root, 'missing'),
        sqlitePath: path.join(root, 'v5.sqlite'),
        exportPath: output,
        verbose: false,
      }),
    );
    assert.equal(closed.mock.callCount(), 1);
    assert.equal(await readFile(output, 'utf8'), 'untouched');
    interaction(['e']);
    await app({
      gtfsPath: feed,
      sqlitePath: path.join(root, 'v5.sqlite'),
      exportPath: path.join(root, 'retry'),
      verbose: false,
    });
    assert.equal(closed.mock.callCount(), 2);
  } finally {
    mock.restoreAll();
  }
});

test('invalid configuration fails before reviewing', async () => {
  await assert.rejects(app({ skipImport: true }), /persistent/);
  await assert.rejects(app({}), /No gtfsPath/);
  await assert.rejects(
    app({ gtfsPath: feed, ignoreErrors: true }),
    /Unsupported legacy/,
  );
});

test('unsuccessful import result never starts review or export', async () => {
  const closed = mock.method(Gtfs.prototype, 'close');
  mock.method(Gtfs.prototype, 'import', async () => ({
    success: false,
    errors: ['fixture failure'],
  }));
  const exported = mock.method(Gtfs.prototype, 'export', async () => {
    throw new Error('Must not export');
  });
  const prompt = mock.method(readline, 'keyIn', () => {
    throw new Error('Must not prompt');
  });
  try {
    await assert.rejects(
      app({ gtfsPath: feed, verbose: false }),
      /GTFS import failed/,
    );
    assert.equal(exported.mock.callCount(), 0);
    assert.equal(prompt.mock.callCount(), 0);
    assert.equal(closed.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
  }
});

test('prompt failure stops speech, closes the database and propagates', async () => {
  const closed = mock.method(Gtfs.prototype, 'close');
  const stopped = mock.method(say, 'stop', () => {});
  mock.method(say, 'speak', () => {});
  mock.method(readline, 'keyIn', () => {
    throw new Error('terminal unavailable');
  });
  try {
    await assert.rejects(
      app({ gtfsPath: feed, verbose: false }),
      /terminal unavailable/,
    );
    assert.equal(stopped.mock.callCount(), 1);
    assert.equal(closed.mock.callCount(), 1);
  } finally {
    mock.restoreAll();
  }
});
