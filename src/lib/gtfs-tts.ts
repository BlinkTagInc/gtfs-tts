import path from 'node:path';
import chalk from 'chalk';
import { Gtfs } from 'gtfs';
import readlineSync from 'readline-sync';
import untildify from 'untildify';
import say from 'say';
import { generateFolderName } from './file-utils.js';
import { log, logError } from './log-utils.js';
import { gtfsOptions, setDefaultConfig, type AppConfig } from './utils.js';

const marker = '***NEEDS VALUE***';

const gtfsTTS = async (initialConfig: AppConfig) => {
  const config = setDefaultConfig(initialConfig);
  const writeLog = log(config);
  if (!config.skipImport && !config.gtfsPath && !config.gtfsUrl) {
    throw new Error('No gtfsPath or gtfsUrl provided');
  }
  if (config.skipImport && config.sqlitePath === ':memory:') {
    throw new Error('skipImport requires a persistent sqlitePath');
  }

  const gtfs = new Gtfs(gtfsOptions(config));
  try {
    if (!config.skipImport) {
      const result = await gtfs.import();
      if (!result.success) {
        throw new Error(`GTFS import failed: ${JSON.stringify(result.errors)}`);
      }
    }
    const stops = await gtfs.schedule.stops.all();
    const agencies = await gtfs.schedule.agency.select('agency_name').all();
    if (stops.length === 0 && agencies.length === 0) {
      throw new Error(`No GTFS data found for sourceId "${config.sourceId}"`);
    }
    writeLog('Starting GTFS Text-to-Speech Testing');
    writeLog(
      'For each stop, press "y" if pronunciation is correct or "n" if incorrect. Press "r" to repeat. Press "e" to end.\n',
    );

    review: for (const stop of stops) {
      while (true) {
        let answer: string;
        try {
          say.speak(stop.tts_stop_name ?? stop.stop_name ?? '');
          const existing = stop.tts_stop_name
            ? `*tts_stop_name exists*: ${chalk.blue(stop.tts_stop_name)}`
            : '';
          answer = readlineSync
            .keyIn(
              `Stop ID ${stop.stop_id}: ${chalk.yellow(stop.stop_name ?? '')} ${existing}\nPronunciation correct? (y/n/r/e): `,
            )
            .trim()
            .toLowerCase();
        } finally {
          say.stop();
        }
        if (answer === 'e') {
          break review;
        }
        if (answer === 'n') {
          await gtfs.database.withKysely({
            callback: (database) =>
              database
                .updateTable('stops')
                .set({ tts_stop_name: marker })
                .where('source_id', '=', config.sourceId)
                .where('stop_id', '=', stop.stop_id)
                .execute(),
          });
          break;
        }
        if (answer === 'y') {
          break;
        }
        if (answer !== 'r') {
          writeLog('Valid options are "y", "n", "r" and "e"\n');
        }
      }
    }

    const folderName = generateFolderName(
      agencies[0]?.agency_name ?? 'unknown-agency',
    );
    const exportPath = untildify(
      config.exportPath || path.join(process.cwd(), 'gtfs-output', folderName),
    );
    await gtfs.export({
      sourceId: config.sourceId,
      outputDirectory: exportPath,
      overwrite: true,
    });
    const count = await gtfs.schedule.stops
      .where({ tts_stop_name: marker })
      .count();
    writeLog(`GTFS Data created at ${exportPath}`);
    writeLog(
      `${count} stops with incorrect pronunciation found. Look for "${marker}" in the tts_stop_name column in stops.txt.`,
    );
  } catch (error: any) {
    if (error?.code === 'GTFS_DATABASE_OPEN_FAILED') {
      logError(config)(
        `Unable to open sqlite database "${config.sqlitePath}". Ensure its parent directory exists.`,
      );
    }
    throw error;
  } finally {
    await gtfs.close();
  }
};

export default gtfsTTS;
