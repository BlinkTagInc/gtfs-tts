import path from 'node:path';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { snakeCase } from 'lodash-es';
import sanitize from 'sanitize-filename';
import untildify from 'untildify';

/*
 * Attempt to parse the specified config JSON file.
 */
export async function getConfig(argv) {
  let config;

  if (argv.configPath) {
    // If a `configPath` is specified, try to read it and throw error if it doesn't exist
    try {
      const data = await readFile(path.resolve(untildify(argv.configPath)), 'utf8').catch(error => {
        console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
        throw error;
      });
      config = Object.assign(JSON.parse(data), argv);
    } catch (error) {
      console.error(new Error(`Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`));
      throw error;
    }
  } else if (existsSync(path.resolve('./config.json'))) {
    // Else if `config.json` exists, use config values read from it
    try {
      const data = await readFile(path.resolve('./config.json'), 'utf8');
      config = Object.assign(JSON.parse(data), argv);
      console.log('Using configuration from ./config.json');
    } catch (error) {
      console.error(new Error('Cannot parse configuration file at `./config.json`. Check to ensure that it is valid JSON.'));
      throw error;
    }
  } else {
    // Use argv values from CLI
    config = argv;
  }

  return config;
}

/*
 * Prepare the specified directory for saving HTML timetables by deleting
 * everything and creating the expected folders.
 */
export async function prepDirectory(exportPath) {
  await rm(exportPath, { recursive: true, force: true });
  await mkdir(exportPath, { recursive: true });
}

/*
 * Generate a folder name based on a string.
 */
export function generateFolderName(folderName) {
  return snakeCase(sanitize(folderName));
}
