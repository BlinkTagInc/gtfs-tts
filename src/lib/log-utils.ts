import type { AppConfig } from './utils.js';
import { clearLine, cursorTo } from 'node:readline';
import PrettyError from 'pretty-error';
import { noop } from 'lodash-es';
import chalk from 'chalk';

const pe = new PrettyError();
pe.start();

/*
 * Returns a log function based on config settings
 */
export function log(config: AppConfig) {
  if (config.verbose === false) {
    return noop;
  }

  if (config.logFunction) {
    return config.logFunction;
  }

  return (text: string, overwrite?: boolean) => {
    if (overwrite === true) {
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);
    } else {
      process.stdout.write('\n');
    }

    process.stdout.write(text);
  };
}

/*
 * Returns an warning log function based on config settings
 */
export function logWarning(config: AppConfig) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text: string) => {
    process.stdout.write(`\n${formatWarning(text)}\n`);
  };
}

/*
 * Returns an error log function based on config settings
 */
export function logError(config: AppConfig) {
  if (config.logFunction) {
    return config.logFunction;
  }

  return (text: string) => {
    process.stdout.write(`\n${formatError(text)}\n`);
  };
}

/*
 * Format console warning text
 */
export function formatWarning(text: string) {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(':')} ${chalk.yellow(text)}`;
}

/*
 * Format console error text
 */
export function formatError(text: string) {
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(text)}`;
}
