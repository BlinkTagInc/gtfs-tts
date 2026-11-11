# GTFS Text-to-Speech

<p align="center">
  <img src="docs/images/gtfs-tts-logo.svg" alt="GTFS Text-to-Speech logo" width="240">
</p>

[![npm version](https://img.shields.io/npm/v/gtfs-tts.svg)](https://www.npmjs.com/package/gtfs-tts)
[![Monthly npm downloads](https://img.shields.io/npm/dm/gtfs-tts.svg)](https://www.npmjs.com/package/gtfs-tts)
[![Build status](https://img.shields.io/github/actions/workflow/status/BlinkTagInc/gtfs-tts/nodejs.yml)](https://github.com/BlinkTagInc/gtfs-tts/actions/workflows/nodejs.yml)
[![MIT license](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

Listen to a transit feed's stop names and flag pronunciations that need work.
**GTFS Text-to-Speech reads each stop aloud**, then exports a feed with incorrect
pronunciations marked in the `tts_stop_name` column of `stops.txt`.
Use those marks to find abbreviations, numbers, and names that need a phonetic spelling.

Built on [node-GTFS v5](https://github.com/BlinkTagInc/node-gtfs), with the same
configuration structure and import/export behavior. This release uses
`gtfs@5.0.0-beta.0`.

## Get started

Install Node.js 22.18+ (22.x), 24, or 26+, then install the command:

```sh
npm install --global gtfs-tts
gtfs-tts --input ./gtfs.zip --output ./reviewed-gtfs
```

The input can be a ZIP or a directory of GTFS files. To download a feed, use
`--url https://example.com/gtfs.zip` instead of `--input`.

Run this in an interactive terminal with audio enabled. Speech uses macOS's
`say`, Windows PowerShell's `System.Speech`, or `espeak` on Linux. Install
`espeak` with your system package manager on Linux.

After each pronunciation finishes, press a key:

| Key | Action                                    |
| --- | ----------------------------------------- |
| `y` | Accept the pronunciation and continue     |
| `n` | Mark the stop for correction and continue |
| `r` | Listen again                              |
| `e` | End the review and export the work so far |

Stops are reviewed in stop ID order. If a stop has a `tts_stop_name`, that is
what you hear; otherwise, you hear its `stop_name`. Previously flagged stops
use the original name. Accepting one of those stops clears its flag.

Incorrect pronunciations are replaced with `***NEEDS VALUE***` in
`tts_stop_name`. This also replaces any existing pronunciation for that stop.
Edit these values in the exported `stops.txt` before publishing the feed.
Unreviewed stops keep their existing values.

Existing export directories are preserved unless you pass `--overwrite` or set
`export.overwrite` to `true`. Without `--output`, node-GTFS chooses a directory
under `./gtfs-export` using the agency name and a source identity hash.

## Configuration

Start with [config-sample.json](config-sample.json), or see
[config-sample-full.json](config-sample-full.json) for import and review options:

```json
{
  "database": { "path": "./gtfs.sqlite" },
  "sources": [
    {
      "sourceId": "transit",
      "schedule": { "path": "./gtfs.zip" }
    }
  ],
  "export": { "outputDirectory": "./reviewed-gtfs" }
}
```

```sh
gtfs-tts --config ./config.json
```

The command reads `./config.json` when present. Relative paths resolve from the
current working directory. CLI flags override the corresponding config values;
`--input` and `--url` replace the configured source list with one source.
`--database` replaces the database configuration with a SQLite path.
Use `gtfs-tts --help` for all flags.

`database`, `sources`, `extensions`, `reporting`, and `export` follow
[node-GTFS configuration](https://github.com/BlinkTagInc/node-gtfs/blob/main/docs/configuration.md).
The default database is in memory. Optional GTFS extensions are opt-in; list
any extensions your feed uses so their files survive the round trip. Unknown
columns are preserved by default. This is a GTFS import/export, not a byte-for-byte
copy: unsupported files are not copied.

The `review` section controls this tool:

| Option            | Default                                | Purpose                                                                    |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `sourceId`        | Sole configured source, or `"default"` | Source to import, review, and export; required with multiple sources       |
| `input`           | `"schedule"`                           | Import the selected schedule, or use `"database"` for stored data          |
| `flaggedStopName` | `"***NEEDS VALUE***"`                  | Marker without surrounding whitespace written for incorrect pronunciations |

Only the selected source is imported and reviewed. If you set `export.sourceId`,
it must match the reviewed source. Choose a marker that cannot be mistaken for
a real pronunciation, and keep it the same between reviews.

To review stored data without replacing previous edits, use a persistent database:

```sh
gtfs-tts --database ./gtfs.sqlite --from-database \
  --source-id transit --output ./reviewed-gtfs --overwrite
```

This starts from the first stop again; it does not track a resume position.
Importing the schedule again replaces stored edits. Pressing Ctrl+C or encountering
an error stops without exporting; changes already made to a persistent database
remain available for another review.

## JavaScript and TypeScript

```js
import { reviewGtfs } from 'gtfs-tts';

const result = await reviewGtfs({
  database: { path: ':memory:' },
  sources: [{ sourceId: 'transit', schedule: { path: './gtfs.zip' } }],
  export: { outputDirectory: './reviewed-gtfs' },
});

console.log(result.flaggedStops, result.outputDirectory);
```

By default, the API uses the same terminal and speech interaction as the CLI.
For your own interface, pass a `reviewStop` callback as the second argument:

```js
const result = await reviewGtfs(config, {
  async reviewStop({ stop, pronunciation, index, total }) {
    return await yourReviewInterface({ stop, pronunciation, index, total });
  },
});
```

Return `"correct"`, `"incorrect"`, or `"end"`. The callback handles any speech or
repeat behavior. `index` is zero-based. The result includes `sourceId`,
`outputDirectory`, `totalStops`, `reviewedStops`, `flaggedStops`, and `endedEarly`.
`flaggedStops` counts every marked stop in the exported source, including marks
from earlier reviews.

Library logging is silent unless you supply `reporting.reporter`; use
`createConsoleReporter()` from `gtfs` for the CLI's output. `reporting.level`
controls diagnostics (`silent`, `error`, `warn`, or `info`), not review prompts.
Owned database connections close on success and failure; caller-supplied
`database.client` connections remain open, following node-GTFS ownership rules.

## Contributing

[Issues and pull requests](https://github.com/BlinkTagInc/gtfs-tts/issues) are welcome.
