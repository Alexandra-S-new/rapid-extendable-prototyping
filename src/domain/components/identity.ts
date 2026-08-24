import type { EntityKind, Role } from '../value-objects/enums.js';

// Identity (Subtask 2 §3): Art des Entities, unveränderlich nach Erzeugung.
// role (v2, Subtask 9 §7/ADR-V2-04): optional, nur initial vergeben, nie
// gewechselt — passt zur Unveränderlichkeit von Identity nach Erzeugung.
export interface Identity {
  readonly kind: EntityKind;
  readonly species?: string;
  readonly displayName: string;
  readonly role?: Role;
}
