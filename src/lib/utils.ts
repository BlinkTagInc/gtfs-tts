import type { GtfsExtension, GtfsInstanceOptions } from 'gtfs';

export interface AppConfig {
  sqlitePath?: string;
  gtfsPath?: string;
  gtfsUrl?: string;
  sourceId?: string;
  skipImport?: boolean;
  exportPath?: string;
  verbose?: boolean;
  logFunction?: (text: string, overwrite?: boolean) => void;
  extensions?: GtfsExtension[];
  ignoreDuplicates?: boolean;
  downloadTimeout?: number;
  csvOptions?: { skip_empty_lines?: boolean; relax_quotes?: boolean };
  logLevel?: 'info' | 'warning' | 'error' | 'silent';
}

export function setDefaultConfig(initialConfig: AppConfig) {
  const legacy = initialConfig as Record<string, unknown>;
  for (const key of ['ignoreErrors', 'agencies', 'db', 'prefix']) {
    if (legacy[key] !== undefined) {
      throw new Error(
        `Unsupported legacy option ${key}; see docs/migration-v5.md`,
      );
    }
  }
  for (const key of Object.keys(initialConfig.csvOptions ?? {})) {
    if (!['skip_empty_lines', 'relax_quotes'].includes(key)) {
      throw new Error(`Unsupported csvOptions.${key}`);
    }
  }
  return {
    ...initialConfig,
    skipImport: initialConfig.skipImport ?? false,
    sqlitePath: initialConfig.sqlitePath ?? ':memory:',
    sourceId: initialConfig.sourceId ?? 'default',
  };
}

export function gtfsOptions(
  config: ReturnType<typeof setDefaultConfig>,
): GtfsInstanceOptions {
  const input = config.gtfsPath
    ? { path: config.gtfsPath }
    : config.gtfsUrl
      ? { url: config.gtfsUrl, timeoutMs: config.downloadTimeout }
      : undefined;
  return {
    database: { path: config.sqlitePath },
    sources:
      !config.skipImport && input
        ? [
            {
              sourceId: config.sourceId,
              schedule: {
                ...input,
                import: {
                  csv: {
                    skipEmptyLines: config.csvOptions?.skip_empty_lines,
                    relaxQuotes: config.csvOptions?.relax_quotes,
                  },
                  validation: {
                    onDuplicateKey: config.ignoreDuplicates
                      ? 'keep-first'
                      : 'reject',
                  },
                },
              },
            },
          ]
        : [{ sourceId: config.sourceId }],
    // Preserve v4's supported file extensions during the round trip.
    extensions: config.extensions ?? [
      'gtfs-plus',
      'gtfs-ride',
      'gtfs-to-html',
      'tods-v1',
    ],
    reporting: {
      level:
        config.verbose === false
          ? 'silent'
          : config.logLevel === 'warning'
            ? 'warn'
            : (config.logLevel ?? 'info'),
      reporter: (event) => {
        if ('message' in event) {
          (config.logFunction ?? console.log)(String(event.message));
        }
      },
    },
  };
}
