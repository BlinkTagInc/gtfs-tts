import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  rm,
  mkdir,
  cp,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Gtfs } from 'gtfs';
import { reviewGtfs } from '../../dist/index.js';

const feed = path.resolve('test/fixtures/feed');
const extensions = ['gtfs-plus'];
const marker = '***NEEDS VALUE***';

async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gtfs-tts-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function config(root, changes = {}) {
  return {
    database: { path: ':memory:' },
    sources: [{ sourceId: 'one', schedule: { path: feed } }],
    extensions,
    export: { outputDirectory: path.join(root, 'output') },
    ...changes,
  };
}

function interaction(answers) {
  const observed = [];
  return {
    observed,
    reviewStop(context) {
      observed.push(context);
      assert.ok(answers.length, 'Unexpected extra prompt');
      return answers.shift();
    },
  };
}

test('review uses stop ID order, existing pronunciation, early exit, and extension round trip', async (t) => {
  const root = await temporary(t);
  const reviewer = interaction(['incorrect', 'correct', 'end']);
  const result = await reviewGtfs(config(root), reviewer);
  assert.deepEqual(result, {
    sourceId: 'one',
    outputDirectory: path.join(root, 'output'),
    totalStops: 3,
    reviewedStops: 2,
    flaggedStops: 1,
    endedEarly: true,
  });
  assert.deepEqual(
    reviewer.observed.map(({ pronunciation }) => pronunciation),
    ['First St', 'Second Street', 'Third St'],
  );
  assert.deepEqual(
    reviewer.observed.map(({ index }) => index),
    [0, 1, 2],
  );
  assert.deepEqual(
    (await readdir(result.outputDirectory)).sort(),
    (await readdir(feed)).sort(),
  );
  const stops = await readFile(
    path.join(result.outputDirectory, 'stops.txt'),
    'utf8',
  );
  assert.match(stops, /001,,First St,\*\*\*NEEDS VALUE\*\*\*/);
  assert.match(stops, /Second Street/);
  assert.doesNotMatch(stops, /source_id|_unknown_fields/);
});

test('persistent review isolates overlapping source IDs, speaks original name, and clears an accepted flag', async (t) => {
  const root = await temporary(t);
  const database = { path: path.join(root, 'v5.sqlite') };
  const gtfs = new Gtfs({
    database,
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
  const options = config(root, {
    database,
    sources: undefined,
    review: { input: 'database', sourceId: 'one' },
  });
  await reviewGtfs(options, interaction(['incorrect', 'end']));
  const reopened = new Gtfs({ database, extensions });
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
  const reviewer = interaction(['correct', 'end']);
  const result = await reviewGtfs(
    { ...options, export: { ...options.export, overwrite: true } },
    reviewer,
  );
  assert.equal(reviewer.observed[0].pronunciation, 'First St');
  assert.equal(result.flaggedStops, 0);
  assert.doesNotMatch(
    await readFile(path.join(result.outputDirectory, 'stops.txt'), 'utf8'),
    /NEEDS VALUE/,
  );
});

test('only imports and reviews the selected source from a multi-source config', async (t) => {
  const root = await temporary(t);
  const database = { path: path.join(root, 'v5.sqlite') };
  const reviewer = interaction(['correct', 'correct', 'correct']);
  const result = await reviewGtfs(
    config(root, {
      database,
      sources: [
        { sourceId: 'one', schedule: { path: feed } },
        { sourceId: 'two', schedule: { path: path.join(root, 'missing') } },
      ],
      review: { sourceId: 'one' },
    }),
    reviewer,
  );
  assert.equal(result.reviewedStops, 3);
  assert.equal(result.endedEarly, false);
  const gtfs = new Gtfs({ database, extensions });
  try {
    assert.equal(
      await gtfs.schedule.stops.where({ source_id: 'two' }).count(),
      0,
    );
  } finally {
    await gtfs.close();
  }
});

test('failed import leaves output intact, closes instance, and permits retry', async (t) => {
  const root = await temporary(t);
  const options = config(root, {
    database: { path: path.join(root, 'v5.sqlite') },
  });
  await writeFile(options.export.outputDirectory, 'untouched');
  const closed = mock.method(Gtfs.prototype, 'close');
  t.after(() => mock.restoreAll());
  await assert.rejects(
    reviewGtfs(
      {
        ...options,
        sources: [{ schedule: { path: path.join(root, 'missing') } }],
      },
      interaction([]),
    ),
  );
  assert.equal(closed.mock.callCount(), 1);
  assert.equal(
    await readFile(options.export.outputDirectory, 'utf8'),
    'untouched',
  );
  await reviewGtfs(
    { ...options, export: { outputDirectory: path.join(root, 'retry') } },
    interaction(['end']),
  );
  assert.equal(closed.mock.callCount(), 2);
});

test('unsuccessful import result never starts review or export', async (t) => {
  const root = await temporary(t);
  const closed = mock.method(Gtfs.prototype, 'close');
  mock.method(Gtfs.prototype, 'import', async () => ({
    success: false,
    errors: ['fixture failure'],
  }));
  const exported = mock.method(Gtfs.prototype, 'export', async () => {
    throw new Error('Must not export');
  });
  t.after(() => mock.restoreAll());
  const reviewer = interaction([]);
  await assert.rejects(
    reviewGtfs(config(root), reviewer),
    /GTFS import failed/,
  );
  assert.equal(reviewer.observed.length, 0);
  assert.equal(exported.mock.callCount(), 0);
  assert.equal(closed.mock.callCount(), 1);
});

test('review callback errors close database and do not export', async (t) => {
  const root = await temporary(t);
  const closed = mock.method(Gtfs.prototype, 'close');
  t.after(() => mock.restoreAll());
  await assert.rejects(
    reviewGtfs(config(root), {
      reviewStop() {
        throw new Error('terminal unavailable');
      },
    }),
    /terminal unavailable/,
  );
  assert.equal(closed.mock.callCount(), 1);
  assert.deepEqual(await readdir(root), []);
});

test('unknown decisions fail instead of silently accepting a stop', async (t) => {
  const root = await temporary(t);
  await assert.rejects(
    reviewGtfs(config(root), interaction(['yes'])),
    /Invalid review decision/,
  );
  assert.deepEqual(await readdir(root), []);
});

test('export does not replace existing output without explicit overwrite', async (t) => {
  const root = await temporary(t);
  const options = config(root);
  await mkdir(options.export.outputDirectory);
  await writeFile(
    path.join(options.export.outputDirectory, 'keep.txt'),
    'untouched',
  );
  await assert.rejects(
    reviewGtfs(options, interaction(['end'])),
    /already exists/,
  );
  assert.equal(
    await readFile(
      path.join(options.export.outputDirectory, 'keep.txt'),
      'utf8',
    ),
    'untouched',
  );
  await reviewGtfs(
    { ...options, export: { ...options.export, overwrite: true } },
    interaction(['end']),
  );
  assert.ok(
    (await readdir(options.export.outputDirectory)).includes('stops.txt'),
  );
});

test('custom flag text and empty pronunciation fallback', async (t) => {
  const root = await temporary(t);
  const localFeed = path.join(root, 'feed');
  await cp(feed, localFeed, { recursive: true });
  await writeFile(
    path.join(localFeed, 'stops.txt'),
    'stop_id,stop_name,stop_lat,stop_lon,tts_stop_name\n001,First St,37,-122,   \n',
  );
  const reviewer = interaction(['incorrect']);
  const result = await reviewGtfs(
    config(root, {
      sources: [{ schedule: { path: localFeed } }],
      review: { flaggedStopName: 'FIX ME' },
    }),
    reviewer,
  );
  assert.equal(reviewer.observed[0].pronunciation, 'First St');
  assert.equal(result.flaggedStops, 1);
  assert.match(
    await readFile(path.join(result.outputDirectory, 'stops.txt'), 'utf8'),
    /FIX ME/,
  );
});

test('reporting uses structured v5 events and respects the configured threshold', async (t) => {
  const root = await temporary(t);
  const events = [];
  await reviewGtfs(
    config(root, { reporting: { reporter: (event) => events.push(event) } }),
    interaction(['end']),
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === 'message' && event.message.includes('0 stops reviewed'),
    ),
  );
  assert.ok(events.every((event) => typeof event.timestampMs === 'number'));
  events.length = 0;
  await reviewGtfs(
    config(root, {
      reporting: { level: 'silent', reporter: (event) => events.push(event) },
      export: { outputDirectory: path.join(root, 'silent') },
    }),
    interaction(['end']),
  );
  assert.deepEqual(events, []);
});

test('invalid and legacy configuration fails before review', async (t) => {
  const root = await temporary(t);
  const base = config(root);
  const cases = [
    [null, /object/],
    [{}, /Schedule review requires/],
    [{ ...base, review: null }, /object/],
    [{ ...base, review: { input: null } }, /review.input/],
    [{ ...base, review: { sourceId: null } }, /sourceId/],
    [{ ...base, review: { flaggedStopName: null } }, /nonempty/],
    [{ ...base, review: { input: 'database' } }, /persistent/],
    [{ ...base, gtfsPath: feed }, /removed/],
    [{ ...base, review: { input: 'invalid' } }, /review.input/],
    [{ ...base, review: { flaggedStopName: '' } }, /nonempty/],
    [{ ...base, review: { typo: true } }, /Unknown review option/],
    [{ ...base, sources: 'bad' }, /array/],
    [{ ...base, sources: [null] }, /object/],
    [{ ...base, review: { sourceId: 'missing' } }, /not a configured source/],
    [{ ...base, export: { sourceId: 'two' } }, /must match/],
    [
      {
        ...base,
        sources: [
          ...base.sources,
          { sourceId: 'two', schedule: { path: feed } },
        ],
      },
      /Set review.sourceId/,
    ],
    [{ ...base, typo: true }, /Unknown|unknown|Unsupported|unsupported/],
    [{ ...base, reporting: { level: 'warning' } }, /reporting/],
  ];
  for (const [options, message] of cases) {
    await assert.rejects(reviewGtfs(options, interaction([])), message);
  }
});

test('borrowed database remains usable after review', async (t) => {
  const root = await temporary(t);
  const owner = new Gtfs(config(root));
  try {
    assert.equal((await owner.import()).success, true);
    await owner.database.withKysely({
      callback: async (client) => {
        const result = await reviewGtfs(
          config(root, {
            database: { client },
            review: { input: 'database', sourceId: 'one' },
          }),
          interaction(['incorrect', 'end']),
        );
        assert.equal(result.flaggedStops, 1);
        const rows = await client
          .selectFrom('stops')
          .select('stop_id')
          .execute();
        assert.equal(rows.length, 3);
      },
    });
    assert.equal(await owner.schedule.stops.count(), 3);
  } finally {
    await owner.close();
  }
});
