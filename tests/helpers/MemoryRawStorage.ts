import type { RawStorage } from '../../src/world/ports.js';

// RawStorage-Stub für Persistence-Tests ohne echtes Dateisystem (Subtask 3
// §7.5/§18).
export class MemoryRawStorage implements RawStorage {
  private readonly files = new Map<string, string>();

  read(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: no such file: ${path}`);
    return content;
  }

  write(path: string, content: string): void {
    this.files.set(path, content);
  }

  setRaw(path: string, content: string): void {
    this.files.set(path, content);
  }
}
