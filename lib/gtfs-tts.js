import path from 'node:path';

import { clone, omit } from 'lodash-es';
import chalk from 'chalk';
import { openDb, getDb, importGtfs, exportGtfs, getStops } from 'gtfs';
import readlineSync from 'readline-sync';
import untildify from 'untildify';
import say from 'say';

import { generateFolderName, prepDirectory } from './file-utils.js';
import { log, logWarning, logError } from './log-utils.js';
import { setDefaultConfig } from './utils.js';

/*
 * Loop through each stop and pronounce each stop name
 */
const gtfsTTS = async initialConfig => {
  const config = setDefaultConfig(initialConfig);
  config.log = log(config);
  config.logWarning = logWarning(config);
  config.logError = logError(config);

  await openDb(config).catch(error => {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(`Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`);
    }

    throw error;
  });

  const db = getDb();

  if (!config.skipImport) {
    // Import GTFS
    if (!config.gtfsPath && !config.gtfsUrl) {
      throw new Error('No gtfs info defined in `config.json`.');
    }

    const gtfsImportConfig = clone(omit(config, ['gtfsPath', 'gtfsUrl']));
    gtfsImportConfig.agencies = [
      {
        path: config.gtfsPath,
        url: config.gtfsUrl,
      },
    ];

    await importGtfs(gtfsImportConfig);
  }

  config.log('Starting GTFS Text-to-Speech Testing');
  config.log('For each stop, press "y" if pronunciation is correct or "n" if incorrect. Press "r" to repeat.\n');

  const stops = await getStops();

  const readStopName = stop => {
    say.speak(stop.stop_name);

    const answer = readlineSync.question(`Stop ID ${stop.stop_id}: ${chalk.yellow(stop.stop_name)}\nPronunciation correct? (y/n/r): `);

    say.stop();

    if (answer.trim().toLowerCase() === 'r') {
      return readStopName(stop);
    }

    if (answer.trim().toLowerCase() === 'n') {
      return db.run('UPDATE stops SET tts_stop_name = ? WHERE stop_id = ?', ['***NEEDS VALUE***', stop.stop_id]);
    }

    if (answer.trim().toLowerCase() === 'y') {
      return;
    }

    config.log('Valid options are "y", "n" and "r"\n');
    return readStopName(stop);
  };

  /* eslint-disable no-await-in-loop */
  for (const stop of stops.slice(0, 1)) {
    if (stop.tts_stop_name) {
      config.log(`Stop ID ${stop.stop_id} *tts_stop_name exists*: ${chalk.yellow(stop.stop_name)} = ${chalk.blue(stop.tts_stop_name)}\n`);
      await new Promise(resolve => {
        say.speak(stop.tts_stop_name, null, null, resolve);
      });
      continue;
    }

    await readStopName(stop);
  }
  /* eslint-enable no-await-in-loop */

  // Get agency name for export folder from first line of agency.txt
  const agency = await db.get('SELECT agency_name FROM agency;').catch(() => {
    throw new Error('No agencies found in SQLite. Be sure to first import data into SQLite using `gtfs-import` or `gtfs.import(config);`');
  });
  const folderName = generateFolderName(agency.agency_name);
  const defaultExportPath = path.join(process.cwd(), 'gtfs-output', folderName);
  const exportPath = untildify(config.exportPath || defaultExportPath);

  await prepDirectory(exportPath);

  // Export GTFS with tts_stop_name field
  await exportGtfs({
    exportPath,
    sqlitePath: config.sqlitePath,
  });

  const stopTTSCount = await db.get('SELECT COUNT(*) FROM stops WHERE tts_stop_name="***NEEDS VALUE***";');

  config.log(`GTFS Data created at ${exportPath}`);
  config.log(`${stopTTSCount['COUNT(*)']} stops with incorrect pronunciation found. Look for "***NEEDS VALUE***" in the tts_stop_name column in stops.txt.`);
};

export default gtfsTTS;
