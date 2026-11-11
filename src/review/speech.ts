import { spawn } from 'node:child_process';

/** Feed names go through stdin, never through a shell or command-line options. */
export async function speak(text: string, signal: AbortSignal): Promise<void> {
  if (text.trim() === '') {
    throw new Error(
      'This stop has no name to pronounce; correct stop_name before reviewing it',
    );
  }
  let command: string;
  let args: string[];
  switch (process.platform) {
    case 'darwin':
      command = 'say';
      args = [];
      break;
    case 'linux':
      command = 'espeak';
      args = ['--stdin'];
      break;
    case 'win32':
      command = 'powershell.exe';
      args = [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$ErrorActionPreference = 'Stop'; [Console]::InputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $speech = New-Object System.Speech.Synthesis.SpeechSynthesizer; $speech.Speak([Console]::In.ReadToEnd()); $speech.Dispose()",
      ];
      break;
    default:
      throw new Error(
        `Speech is not supported on ${process.platform}; supply a reviewStop callback`,
      );
  }
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      stdio: ['pipe', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let diagnostic = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      diagnostic = (diagnostic + chunk).slice(-4096);
    });
    child.once('error', (cause) => {
      reject(
        signal.aborted
          ? signal.reason
          : new Error(
              `Unable to run ${command}. Ensure the system speech engine is installed.`,
              { cause },
            ),
      );
    });
    child.stdin.on('error', (cause) => {
      reject(new Error(`Unable to send text to ${command}`, { cause }));
    });
    child.once('close', (code) => {
      if (signal.aborted) {
        reject(signal.reason);
      } else if (code !== 0) {
        reject(new Error(`${command} failed (${code}): ${diagnostic.trim()}`));
      } else {
        resolve();
      }
    });
    child.stdin.end(text, 'utf8');
  });
}
