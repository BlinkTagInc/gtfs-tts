import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { createTerminalInteraction } from '../../src/review/terminal.ts';

function terminal(answers, speakText = async () => {}) {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = (raw) => {
    input.isRaw = raw;
  };
  let transcript = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString();
      transcript += text;
      if (text.startsWith('Correct?')) {
        queueMicrotask(() => {
          const answer = answers.shift();
          if (answer === 'interrupt') {
            input.emit('keypress', '\u0003', { ctrl: true, name: 'c' });
          } else if (answer === 'eof') {
            input.emit('end');
          } else {
            input.emit('keypress', 'x', { name: 'x' });
            input.emit('keypress', answer, { name: answer });
          }
        });
      }
      callback();
    },
  });
  output.isTTY = true;
  const session = createTerminalInteraction({ input, output, speakText });
  return { session, input, output, transcript: () => transcript };
}

const context = {
  stop: { stop_id: '001', stop_name: 'Station\u001b[2J' },
  pronunciation: 'Station',
  index: 0,
  total: 1,
};

test('terminal repeat, invalid key handling, prompt text, and raw-mode restoration', async () => {
  const spoken = [];
  const initialListeners = process.listenerCount('SIGINT');
  const { session, input, transcript } = terminal(['r', 'y'], async (text) => {
    spoken.push(text);
  });
  try {
    assert.equal(await session.reviewStop(context), 'correct');
    assert.deepEqual(spoken, ['Station', 'Station']);
    assert.equal(input.isRaw, false);
    assert.equal(input.listenerCount('keypress'), 0);
    assert.equal(transcript().includes('\u001b'), false);
    assert.match(transcript(), /\[1\/1\] Stop 001/);
  } finally {
    session.close();
  }
  assert.equal(process.listenerCount('SIGINT'), initialListeners);
});

test('terminal maps flag and end keys to decisions', async () => {
  for (const [key, decision] of [
    ['n', 'incorrect'],
    ['e', 'end'],
  ]) {
    const { session } = terminal([key]);
    try {
      assert.equal(await session.reviewStop(context), decision);
    } finally {
      session.close();
    }
  }
});

test('Ctrl+C and terminal closure reject and restore raw mode', async () => {
  for (const answer of ['interrupt', 'eof']) {
    const { session, input } = terminal([answer]);
    try {
      await assert.rejects(
        session.reviewStop(context),
        /interrupted|input closed/,
      );
      assert.equal(input.isRaw, false);
      assert.equal(input.listenerCount('keypress'), 0);
    } finally {
      session.close();
    }
  }
});

test('speech failures never request a decision', async () => {
  const { session, transcript } = terminal([], async () => {
    throw new Error('speech failed');
  });
  try {
    await assert.rejects(session.reviewStop(context), /speech failed/);
    assert.doesNotMatch(transcript(), /Correct\?/);
  } finally {
    session.close();
  }
});
