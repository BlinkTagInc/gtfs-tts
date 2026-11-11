#!/usr/bin/env node

import { createConsoleReporter } from 'gtfs';

import { reviewGtfs } from '../index.ts';
import { loadConfig } from '../cli/config.ts';
import { help, parseFlags } from '../cli/options.ts';
import { version } from '../version.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === undefined) {
    process.stdout.write(`${help}\n`);
    return;
  }
  if (command === 'review') {
    args.shift();
  } else if (!command.startsWith('-')) {
    throw new Error(
      `Unknown command ${JSON.stringify(command)}; run gtfs-tts --help`,
    );
  }
  const values = parseFlags(args);
  if (values.help) {
    process.stdout.write(`${help}\n`);
    return;
  }
  if (values.version) {
    process.stdout.write(`${version}\n`);
    return;
  }
  const config = await loadConfig(values);
  await reviewGtfs({
    ...config,
    reporting: { ...config.reporting, reporter: createConsoleReporter() },
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
