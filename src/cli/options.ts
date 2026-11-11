import { parseArgs } from 'node:util';

export function parseFlags(args: string[]) {
  const removed: Record<string, string> = {
    '--configPath': '--config',
    '--gtfsPath': '--input',
    '--gtfsUrl': '--url',
    '--sqlitePath': '--database',
    '--sourceId': '--source-id',
    '--exportPath': '--output',
    '--skipImport': '--from-database',
    '--logLevel': '--log-level',
  };
  for (const argument of args) {
    const flag = argument.split('=')[0] ?? '';
    if (Object.hasOwn(removed, flag)) {
      throw new Error(`CLI flag ${flag} was removed; use ${removed[flag]}`);
    }
  }
  const { values } = parseArgs({
    args,
    options: {
      config: { type: 'string', short: 'c' },
      input: { type: 'string' },
      url: { type: 'string' },
      database: { type: 'string' },
      output: { type: 'string' },
      'source-id': { type: 'string' },
      'from-database': { type: 'boolean' },
      overwrite: { type: 'boolean' },
      'log-level': { type: 'string', short: 'l' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.input !== undefined && values.url !== undefined) {
    throw new Error('Use either --input or --url, not both');
  }
  if (
    values['from-database'] &&
    (values.input !== undefined || values.url !== undefined)
  ) {
    throw new Error('--from-database cannot be combined with --input or --url');
  }
  if (
    values['log-level'] !== undefined &&
    !['silent', 'error', 'warn', 'info'].includes(values['log-level'])
  ) {
    throw new Error('--log-level must be silent, error, warn, or info');
  }
  return values;
}

export type FlagValues = ReturnType<typeof parseFlags>;

export const help = `Usage: gtfs-tts [options]

Listen to GTFS stop names, flag incorrect pronunciations, and export a reviewed feed.

Options:
  -c, --config <path>       Config file [default: ./config.json]
      --input <path>        GTFS directory or ZIP; replaces configured sources
      --url <url>           GTFS ZIP URL; replaces configured sources
      --database <path>     SQLite database [default: :memory:]
      --source-id <id>      Source to import/review [default: sole source or default]
      --output <directory>  Directory for exported GTFS files
      --from-database       Review stored data without importing a schedule
      --overwrite           Replace existing export output
  -l, --log-level <level>   silent, error, warn, info
  -h, --help                Show this help
  -v, --version             Show the gtfs-tts version

CLI values override the corresponding config options.
Relative paths resolve from the current working directory.
See https://github.com/BlinkTagInc/gtfs-tts`;
