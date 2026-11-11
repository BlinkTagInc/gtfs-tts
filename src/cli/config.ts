import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { assertObject } from '../config/review.ts';
import { expandHomeDirectory } from '../io/paths.ts';
import type { ReviewGtfsOptions } from '../types.ts';
import type { FlagValues } from './options.ts';

export async function loadConfig(
  values: FlagValues,
): Promise<ReviewGtfsOptions> {
  const filename =
    values.config ?? (existsSync('config.json') ? 'config.json' : undefined);
  let config: Record<string, unknown> = {};
  if (filename !== undefined) {
    let content: string;
    try {
      content = await readFile(
        path.resolve(expandHomeDirectory(filename)),
        'utf8',
      );
    } catch (cause) {
      throw new Error(
        `Cannot read configuration file ${JSON.stringify(filename)}; pass --config or start with config-sample.json`,
        { cause },
      );
    }
    try {
      config = JSON.parse(content) as Record<string, unknown>;
    } catch (cause) {
      throw new Error(
        `Invalid JSON in configuration file ${JSON.stringify(filename)}`,
        { cause },
      );
    }
    assertObject(config, 'Configuration');
  } else if (
    values.input === undefined &&
    values.url === undefined &&
    values.database === undefined
  ) {
    throw new Error(
      'No configuration file found; pass --config, --input, or --url',
    );
  }
  // Validate groups before merging so malformed JSON cannot become valid accidentally.
  for (const key of ['review', 'export', 'database', 'reporting']) {
    if (config[key] !== undefined) {
      assertObject(config[key], key);
    }
  }
  if (values.database !== undefined) {
    config.database = { path: expandHomeDirectory(values.database) };
  } else if (config.database === undefined) {
    config.database = { path: ':memory:' };
  }
  const review = { ...(config.review as Record<string, unknown> | undefined) };
  if (values.input !== undefined || values.url !== undefined) {
    config.sources = [
      {
        sourceId: values['source-id'] ?? 'default',
        schedule:
          values.input !== undefined
            ? { path: expandHomeDirectory(values.input) }
            : { url: values.url },
      },
    ];
    review.sourceId = values['source-id'] ?? 'default';
    review.input = 'schedule';
  } else if (values['source-id'] !== undefined) {
    review.sourceId = values['source-id'];
  }
  if (values['from-database'] === true) {
    review.input = 'database';
  }
  config.review = review;
  config.export = {
    ...(config.export as Record<string, unknown> | undefined),
    ...(values.output === undefined
      ? {}
      : { outputDirectory: expandHomeDirectory(values.output) }),
    ...(values.overwrite === undefined ? {} : { overwrite: values.overwrite }),
  };
  if (values['log-level'] !== undefined) {
    config.reporting = {
      ...(config.reporting as Record<string, unknown> | undefined),
      level: values['log-level'],
    };
  }
  return config as unknown as ReviewGtfsOptions;
}
