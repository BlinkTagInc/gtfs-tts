import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { test, mock } from 'node:test';
import { speak } from '../../src/review/speech.ts';

function speechProcess(t, finish) {
  let called;
  mock.method(childProcess, 'spawn', (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stderr = new PassThrough();
    let text = '';
    child.stdin.on('data', (chunk) => {
      text += chunk.toString();
    });
    child.stdin.on('finish', () => {
      called.text = text;
      queueMicrotask(() => finish(child, options));
    });
    called = { command, args, options };
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
  });
  return () => called;
}

test('speech passes Unicode and shell-like text through stdin and waits for completion', async (t) => {
  const observed = speechProcess(t, (child) => {
    child.emit('close', 0);
  });
  const text = '-n José $(touch example) "Station"';
  await speak(text, new AbortController().signal);
  assert.equal(observed().text, text);
  assert.equal(observed().options.shell, undefined);
  assert.ok(!observed().args.includes(text));
});

test('speech propagates process-start failures', async (t) => {
  const cause = Object.assign(new Error('missing engine'), { code: 'ENOENT' });
  speechProcess(t, (child) => {
    child.emit('error', cause);
  });
  await assert.rejects(
    speak('Station', new AbortController().signal),
    (error) => {
      assert.match(error.message, /system speech engine/);
      assert.equal(error.cause, cause);
      return true;
    },
  );
});

test('speech propagates unsuccessful exit and stderr diagnostics', async (t) => {
  speechProcess(t, (child) => {
    child.stderr.write('audio unavailable');
    child.emit('close', 1);
  });
  await assert.rejects(
    speak('Station', new AbortController().signal),
    /failed \(1\): audio unavailable/,
  );
});

test('speech cancellation preserves the interruption reason', async (t) => {
  const controller = new AbortController();
  speechProcess(t, (child) => {
    controller.abort(new Error('review cancelled'));
    child.emit('close', null);
  });
  await assert.rejects(speak('Station', controller.signal), /review cancelled/);
});

test('speech rejects empty names instead of silently approving them', async () => {
  await assert.rejects(
    speak('', new AbortController().signal),
    /no name to pronounce/,
  );
});
