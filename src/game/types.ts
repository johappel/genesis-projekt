// ============================================================
// Kerndatentypen – Projekt Genesis
// ============================================================

export type GameValueKey =
  | 'nutzen'
  | 'gerechtigkeit'
  | 'frieden'
  | 'schoepfung'
  | 'autonomie';

export type SpecialValueKey = 'macht';

export type AnyValueKey = GameValueKey | SpecialValueKey;

export type BalanceEffect = Partial<Record<AnyValueKey, number>>;

// -------- Rollen --------

export interface Role {
  id: string;
  icon: string;
  name: string;
  perspective: string;
  abilityDescription: string;
  desc: string;
}

// -------- Linsen --------

export interface Lens {
  id: string;
  icon: string;
  name: string;
  leitfrage: string;
  desc: string;
}

// -------- Fälle --------

export interface DecisionOption {
  id: string;
  text: string;
  icon: string;
  effects: BalanceEffect;
  consequence: string;
  reflexion: string;
  iconResult: string;
  factNoteIds?: string[];
}

export interface Case {
  id: number;
  ki: string;
  kiIcon: string;
  kiColor: string;
  title: string;
  tag: string;
  tagClass: string;
  situation: string;
  problem: string;
  question: string;
  linsenEffekte: Record<string, string>;
  decisions: DecisionOption[];
  reflexionImpuls: string;
  factNoteIds?: string[];
}

// -------- Enden --------

export type EndingCondition = (v: {
  nutzen: number;
  gerechtigkeit: number;
  frieden: number;
  schoepfung: number;
  autonomie: number;
  macht: number;
}) => boolean;

export interface Ending {
  condition: EndingCondition;
  badge: string;
  title: string;
  subtitle: string;
  text: string;
  color: string;
  reflexion: string;
}

// -------- Fakten --------

export type FactStatus = 'fictional' | 'needs-source' | 'sourced';

export interface FactNote {
  id: string;
  claim: string;
  status: FactStatus;
  sourceLabel?: string;
  sourceUrl?: string;
  notes?: string;
}

// -------- Spielzustand --------

export interface AbilityState {
  usedGlobal: boolean;
  usedCases: Record<string, boolean>;
  juristinShieldActive: boolean;
  buergerinForecastActive: boolean;
  prophetinVetoActive: boolean;
  activatedCount: Record<string, number>;
  appliedCount: Record<string, number>;
}

export interface ProtocolEntry {
  fall: string;
  entscheidung: string;
  linse: string;
}

export interface GameState {
  currentCase: number;
  selectedRole: Role | null;
  selectedLens: Lens | null;
  values: Record<GameValueKey, number>;
  macht: number;
  abilities: AbilityState;
  protokoll: ProtocolEntry[];
  linsenUsed: Record<string, number>;
  pakt: Record<string, string>;
}
