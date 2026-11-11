import { homedir } from 'node:os';
import path from 'node:path';

export function expandHomeDirectory(value: string): string {
  if (value === '~') {
    return homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}
