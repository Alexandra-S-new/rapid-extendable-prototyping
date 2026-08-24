import { readFileSync, writeFileSync } from 'node:fs';
import type { RawStorage } from '../world/ports.js';

// FileRawStorage (Subtask 3 §7.5/§8): Infrastructure-Adapter, reines I/O,
// kein Fachwissen.
export class FileRawStorage implements RawStorage {
  read(path: string): string {
    return readFileSync(path, 'utf-8');
  }

  write(path: string, content: string): void {
    writeFileSync(path, content, 'utf-8');
  }
}
