import { emitKeypressEvents } from 'node:readline';
import type { Key } from 'node:readline';

import { speak } from './speech.ts';
import type { ReviewInteraction } from '../types.ts';

// Prevent feed-controlled escape sequences from changing terminal state.
function display(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, ' ');
}

export function createTerminalInteraction({
  input = process.stdin,
  output = process.stderr,
  speakText = speak,
}: {
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  speakText?: typeof speak;
} = {}): ReviewInteraction & {
  readonly signal: AbortSignal;
  close(): void;
} {
  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      'Interactive review requires a terminal; use reviewGtfs(options, { reviewStop }) for programmatic review',
    );
  }
  const controller = new AbortController();
  const interrupt = () => {
    controller.abort(
      new Error(
        'Review interrupted; no feed was exported. Use e to end and export.',
      ),
    );
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  emitKeypressEvents(input);

  async function readAnswer(): Promise<string> {
    controller.signal.throwIfAborted();
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.resume();
    try {
      return await new Promise<string>((resolve, reject) => {
        const cleanup = () => {
          input.off('keypress', onKey);
          input.off('end', onEnd);
          controller.signal.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          cleanup();
          reject(controller.signal.reason);
        };
        const onEnd = () => {
          cleanup();
          reject(new Error('Terminal input closed before review finished'));
        };
        const onKey = (text: string | undefined, key: Key) => {
          if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
            interrupt();
            return;
          }
          const answer = text?.toLowerCase();
          if (answer !== undefined && ['y', 'n', 'r', 'e'].includes(answer)) {
            cleanup();
            output.write(`${answer}\n`);
            resolve(answer);
          }
        };
        input.on('keypress', onKey);
        input.once('end', onEnd);
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
    } finally {
      input.setRawMode(wasRaw);
      input.pause();
    }
  }

  return {
    signal: controller.signal,
    async reviewStop({ stop, pronunciation, index, total }) {
      output.write(
        `\n[${index + 1}/${total}] Stop ${display(stop.stop_id)}: ${display(stop.stop_name ?? '')}\n`,
      );
      if (stop.tts_stop_name?.trim()) {
        output.write(
          `Existing tts_stop_name: ${display(stop.tts_stop_name)}\n`,
        );
      }
      output.write(`Pronunciation: ${display(pronunciation)}\n`);
      while (true) {
        await speakText(pronunciation, controller.signal);
        output.write(
          'Correct? [y] yes  [n] flag  [r] repeat  [e] end and export: ',
        );
        const answer = await readAnswer();
        if (answer === 'e') {
          return 'end';
        }
        if (answer === 'y') {
          return 'correct';
        }
        if (answer === 'n') {
          return 'incorrect';
        }
      }
    },
    close() {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    },
  };
}
