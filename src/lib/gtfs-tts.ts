import path from 'node:path';

import { clone, omit } from 'lodash-es';
import chalk from 'chalk';
import { openDb, importGtfs, exportGtfs, getStops, getAgencies } from 'gtfs';
import readlineSync from 'readline-sync';
import untildify from 'untildify';
import say from 'say';

import { generateFolderName, prepDirectory } from './file-utils.js';
import { log, logWarning, logError } from './log-utils.js';
import { setDefaultConfig } from './utils.js';

interface IStop {
  stop_id: string;
  stop_name: string;
  tts_stop_name?: string;
}

/*
 * Loop through each stop and pronounce each stop name
 */
const gtfsTTS = async (initialConfig: {
  sqlitePath?: string;
  gtfsPath?: string;
  gtfsUrl?: string;
}) => {
  const config = setDefaultConfig(initialConfig);
  config.log = log(config);
  config.logWarning = logWarning(config);
  config.logError = logError(config);

  let db;

  try {
    db = openDb(config);
  } catch (error: any) {
    if (error?.code === 'SQLITE_CANTOPEN') {
      config.logError(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`,
      );
    }

    throw error;
  }

  if (!config.gtfsPath && !config.gtfsUrl) {
    throw new Error('No gtfsPath or gtfsUrl provided');
  }

  if (!config.skipImport) {
    // Import GTFS
    await importGtfs({
      ...config,
      agencies: [
        {
          path: config.gtfsPath,
          url: config.gtfsUrl,
        },
      ],
    });
  }

  config.log('Starting GTFS Text-to-Speech Testing');
  config.log(
    'For each stop, press "y" if pronunciation is correct or "n" if incorrect. Press "r" to repeat. Press "e" to end.\n',
  );

  const stops = getStops();

  const readStopName = (stop: IStop) => {
    say.speak(stop.tts_stop_name ?? stop.stop_name);

    let ttsExistingStopName = '';
    if (stop.tts_stop_name) {
      ttsExistingStopName = `*tts_stop_name exists*: ${chalk.blue(stop.tts_stop_name)}`;
    }

    const answer = readlineSync.keyIn(
      `Stop ID ${stop.stop_id}: ${chalk.yellow(stop.stop_name)} ${ttsExistingStopName}\nPronunciation correct? (y/n/r/e): `,
    );

    say.stop();

    if (answer.trim().toLowerCase() === 'r') {
      readStopName(stop);
      return;
    }

    if (answer.trim().toLowerCase() === 'n') {
      const statement = db.prepare(
        "UPDATE stops SET tts_stop_name = '***NEEDS VALUE***' WHERE stop_id = ?",
      );
      statement.run(stop.stop_id);
      return;
    }

    if (answer.trim().toLowerCase() === 'y') {
      return;
    }

    if (answer.trim().toLowerCase() === 'e') {
      throw new Error('End Loop');
    }

    config.log('Valid options are "y", "n" and "r"\n');
    readStopName(stop);
    return;
  };

  for (const stop of stops) {
    try {
      await readStopName(stop as IStop);
    } catch (error: any) {
      if (error?.message === 'End Loop') {
        break;
      }
    }
  }

  // Get agency name for export folder from first line of agency.txt
  const agencies = getAgencies({}, ['agency_name']);
  const folderName = generateFolderName(
    agencies?.[0].agency_name ?? 'unknown-agency',
  );
  const defaultExportPath = path.join(process.cwd(), 'gtfs-output', folderName);
  const exportPath = untildify(config.exportPath || defaultExportPath);

  await prepDirectory(exportPath);

  // Export GTFS with tts_stop_name field
  await exportGtfs({
    exportPath,
    sqlitePath: config.sqlitePath,
  });

  const stopTTSCount = db
    .prepare(
      "SELECT COUNT(*) FROM stops WHERE tts_stop_name = '***NEEDS VALUE***';",
    )
    .all();

  config.log(`GTFS Data created at ${exportPath}`);
  config.log(
    `${stopTTSCount['COUNT(*)']} stops with incorrect pronunciation found. Look for "***NEEDS VALUE***" in the tts_stop_name column in stops.txt.`,
  );
};

export default gtfsTTS;
