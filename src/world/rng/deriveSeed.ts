// FNV-1a-Hash (Subtask 2 §8): leitet aus masterSeed + benannten Schlüsselteilen
// einen neuen, unabhängigen mulberry32-Anfangszustand ab.
export function deriveSeed(masterSeed: number, ...keyParts: (string | number)[]): number {
  const input = `${masterSeed}:${keyParts.join(':')}`;
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime 16777619, via shifts to stay in 32-bit int arithmetic
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function streamKey(name: string, ...keyParts: (string | number)[]): string {
  return keyParts.length === 0 ? name : `${name}:${keyParts.join(':')}`;
}
