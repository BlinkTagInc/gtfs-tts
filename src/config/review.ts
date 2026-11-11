import type { ReviewGtfsOptions } from '../types.ts';

export function assertObject(
  value: unknown,
  name: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export function resolveReview(options: ReviewGtfsOptions) {
  assertObject(options, 'Configuration');
  const legacy: Record<string, string> = {
    gtfsPath: 'sources[].schedule.path',
    gtfsUrl: 'sources[].schedule.url',
    sqlitePath: 'database.path',
    sourceId: 'review.sourceId',
    skipImport: 'review.input: "database"',
    exportPath: 'export.outputDirectory',
    verbose: 'reporting.level',
    logLevel: 'reporting.level',
    logFunction: 'reporting.reporter',
    csvOptions: 'sources[].schedule.import.csv',
    ignoreDuplicates: 'sources[].schedule.import.validation.onDuplicateKey',
    downloadTimeout: 'sources[].schedule.timeoutMs',
    agencies: 'sources',
  };
  for (const key of Object.keys(options)) {
    if (Object.hasOwn(legacy, key)) {
      throw new Error(`Option ${key} was removed; use ${legacy[key]}.`);
    }
  }
  if (options.review !== undefined) {
    assertObject(options.review, 'review');
  }
  const review = options.review ?? {};
  assertObject(review, 'review');
  for (const key of Object.keys(review)) {
    if (!['sourceId', 'input', 'flaggedStopName'].includes(key)) {
      throw new Error(`Unknown review option: ${key}`);
    }
  }
  const { input = 'schedule' } = review;
  if (input !== 'schedule' && input !== 'database') {
    throw new Error('review.input must be "schedule" or "database"');
  }
  const { flaggedStopName = '***NEEDS VALUE***' } = review;
  if (
    typeof flaggedStopName !== 'string' ||
    flaggedStopName.trim() === '' ||
    flaggedStopName.trim() !== flaggedStopName
  ) {
    throw new Error(
      'review.flaggedStopName must be a nonempty string without surrounding whitespace',
    );
  }
  if (options.sources !== undefined && !Array.isArray(options.sources)) {
    throw new Error('sources must be an array');
  }
  for (const source of options.sources ?? []) {
    assertObject(source, 'sources[]');
  }
  if (review.sourceId === undefined && (options.sources?.length ?? 0) > 1) {
    throw new Error(
      'Set review.sourceId to select one of the configured sources',
    );
  }
  if (
    review.sourceId !== undefined &&
    (typeof review.sourceId !== 'string' || review.sourceId.trim() === '')
  ) {
    throw new Error('review.sourceId must be a nonempty string');
  }
  const sourceId =
    review.sourceId ?? options.sources?.[0]?.sourceId ?? 'default';
  if (typeof sourceId !== 'string' || sourceId.trim() === '') {
    throw new Error('review.sourceId must be a nonempty string');
  }
  const source = options.sources?.find(
    (entry) => (entry.sourceId ?? 'default') === sourceId,
  );
  if (options.sources?.length && source === undefined) {
    throw new Error(
      `review.sourceId ${JSON.stringify(sourceId)} is not a configured source`,
    );
  }
  if (input === 'schedule' && source?.schedule === undefined) {
    throw new Error(
      'Schedule review requires sources[].schedule.path or sources[].schedule.url',
    );
  }
  if (
    input === 'database' &&
    !options.database?.client &&
    (!options.database?.path || options.database.path === ':memory:')
  ) {
    throw new Error(
      'review.input "database" requires a persistent database.path or database.client',
    );
  }
  if (
    options.export?.sourceId !== undefined &&
    options.export.sourceId !== sourceId
  ) {
    throw new Error('export.sourceId must match review.sourceId');
  }
  return { sourceId, input, flaggedStopName, source };
}
