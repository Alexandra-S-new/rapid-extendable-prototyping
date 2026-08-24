import type { EntityId } from '../value-objects/ids.js';

// Relationships (Subtask 2 §3, erweitert Subtask 9 §5, erweitert A1/Subtask
// 15-17): minimaler Sozialgraph (Eltern/Kinder, seit v2 zusätzlich aktuelle
// Partnerschaft, seit A1 zusätzlich Freundschaften).
// partnerId (v2, V2-I1/I2/I2b): einzelnes, optionales Feld — Monogamie,
// priorisiert statt verpflichtend für Fortpflanzung (ADR-V2-02). Bleibt nach
// dem Tod des Partners unverändert bestehen (kein kaskadierendes Bereinigen,
// konsistent mit parentIds/childIds) — Eligibilität für eine neue Partnerschaft
// prüft zusätzlich Lebendigkeit, nicht nur Feld-Präsenz (V2-I2b).
// friendIds (A1, ADR-A1-01, V2-A1-I1..I6): binäre, reziproke, NICHT
// exklusive Freundschaft — beliebig viele gleichzeitig, vollständig
// unabhängig von partnerId (V2-A1-I6). Pflichtfeld (immer ein Array, ggf.
// leer), analog parentIds/childIds, nicht analog zum optionalen partnerId?.
export interface Relationships {
  parentIds: EntityId[];
  childIds: EntityId[];
  partnerId?: EntityId;
  friendIds: EntityId[];
}
