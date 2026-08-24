// Needs (Subtask 2 §3, Subtask 3.6b): Person besitzt hunger/energy/social,
// Animal nur hunger/energy — kein ungenutztes social-Feld bei Animal.
// Systeme unterscheiden strukturell ('social' in needs), nicht über Identity.kind
// (Subtask 3 §4.2: kein System verzweigt auf kind).
export interface PersonNeeds {
  hunger: number;
  energy: number;
  social: number;
}

export interface AnimalNeeds {
  hunger: number;
  energy: number;
}

export type Needs = PersonNeeds | AnimalNeeds;

export function hasSocialNeed(needs: Needs): needs is PersonNeeds {
  return 'social' in needs;
}
