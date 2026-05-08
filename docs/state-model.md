# Genesis-Projekt – Zustandsmodell

## Übersicht

Der gesamte Spielzustand lebt in einem einzigen `GameState`-Objekt in `src/main.ts` (Variable `state`).  
Er ist vollständig serialisierbar und kann mit `JSON.stringify(state)` gesichert werden.  
Die Engine (`src/game/engine/`) verändert ihn **immer durch pure Funktionen**, die alten Zustand rein lesen und neuen zurückgeben.

---

## GameState – vollständige Felddokumentation

```typescript
interface GameState {
  currentCase: number;           // Index des aktuellen Falls in CASES[] (0-basiert)
  selectedRole: Role | null;     // Gerade abstimmende Rolle
  activeRoles: Role[];           // Alle in dieser Partie vergebenen Rollen (kanonisch sortiert)
  currentRoleIndex: number;      // Index von selectedRole in activeRoles[]
  selectedLens: Lens | null;     // Gemeinsame Deutungslinse für den aktuellen Fall
  lensInitiativeIndex: number;   // Welche Rolle darf die nächste Linse wählen (mod activeRoles.length)
  phaseTimerBonusSeconds: number;// Bonus-Sekunden vom Linsen-Pick (addiert auf decisionTimerSeconds)
  values: Record<GameValueKey, number>; // Startwert: 0, Skala -5..+5
  macht: number;                 // Startwert: 5, Skala 0..10
  roundVotes: Record<string, string>; // roleId → optionId, leert sich jede Runde
  councilPreVoteOptionId: string | null; // KI-Fallback-Vorvotum (zufällig, sichtbar)
  tieBreakOptions: string[] | null;     // optionIds bei Gleichstand, null = keine Stichwahl
  tieBreakRound: number;               // Zähler für Stichwahl-Runden
  abilities: AbilityState;             // Sonderfähigkeiten-Status
  protokoll: ProtocolEntry[];          // Partieprotokoll
  linsenUsed: Record<string, number>;  // lensName → Nutzungszähler
  usedLensIdsByRole: Record<string, string[]>; // roleId → [lensId, ...] (verhindert Mehrfachnutzung)
  paktSubmissionsByRole: Record<string, PaktSubmission>; // roleId → eingereichte Antworten
  paktArticleVotesByArticle: Partial<Record<PaktArticleId, Record<string, PaktArticleVote>>>;
  paktWinnersByArticle: Partial<Record<PaktArticleId, string[]>>; // von deriveResolvedPakt() befüllt
  pakt: Record<string, string>;  // Finaler Pakt-Text pro Artikel (Gewinnertext(e))
}
```

### Startwerte (createGame())
| Feld | Wert |
|---|---|
| `currentCase` | 0 |
| `selectedRole` | null |
| `activeRoles` | [] |
| `currentRoleIndex` | 0 |
| `values.*` | 0 |
| `macht` | 5 |
| `roundVotes` | {} |
| `tieBreakOptions` | null |
| `paktSubmissionsByRole` | {} |

---

## AbilityState – Sonderfähigkeiten

```typescript
interface AbilityState {
  usedGlobalByRole: Record<string, boolean>;  // roleId → einmalige Fähigkeit verbraucht
  usedCaseAbilities: Record<string, boolean>; // "roleId:caseId" → pro-Fall-Fähigkeit verbraucht
  juristinShieldActive: boolean;  // true: nächste Runde ignoriert negativen Friedenseffekt
  buergerinForecastActive: boolean; // true: nächste Runde verdoppelt Friedenseffekt
  prophetinVetoActive: boolean;   // true: nächste Entscheidung wird gestoppt
  activatedCount: Record<string, number>; // wie oft wurde Fähigkeit aktiviert
  appliedCount: Record<string, number>;   // wie oft hat Fähigkeit einen Effekt erzeugt
}
```

---

## Werte-Skalen und Schwellen

### Stadtbilanz-Werte (GameValueKey)
| Wert | Startwert | Min | Max | Bedeutung |
|---|---|---|---|---|
| `nutzen` | 0 | -5 | +5 | Funktionalität von Bildung, Gesundheit, Sicherheit |
| `gerechtigkeit` | 0 | -5 | +5 | Faire Verteilung von Chancen und Risiken |
| `frieden` | 0 | -5 | +5 | Sozialer Zusammenhalt, Konfliktfähigkeit |
| `schoepfung` | 0 | -5 | +5 | Ökologische und infrastrukturelle Tragbarkeit |
| `autonomie` | 0 | -5 | +5 | Menschliche Handlungs- und Entscheidungsfähigkeit |

### Algorithmische Macht
| Wert | Startwert | Min | Max |
|---|---|---|---|
| `macht` | 5 | 0 | 10 |

**Schwellen:**
- ≥ 6: Warnung aktiviert (`MACHT_WARN_THRESHOLD`)
- ≥ 8: Kritische Phase, PAX DOMINUS droht (`MACHT_CRITICAL_THRESHOLD`)
- ≥ 10 oder `autonomie ≤ -5`: PAX DOMINUS ausgelöst (Notfall-Ending)

### Systemische Folgewirkungen (automatisch nach `closeRound()`)
Diese Regeln lösen zusätzliche Wertänderungen aus, wenn bestimmte Schwellen unterschritten werden:

| Auslöser | Zusatzeffekt |
|---|---|
| `nutzen ≤ -2` | `frieden -1` |
| `nutzen ≤ -2` **und** `gerechtigkeit ≤ -1` | `frieden -1` (extra) |
| `nutzen ≥ 2` **und** `gerechtigkeit ≤ -2` | `frieden -1` |
| `autonomie ≤ -2` **und** `macht ≥ 7` | `frieden -1` |
| `schoepfung ≤ -2` | `nutzen -1` |
| `schoepfung ≤ -3` **und** `nutzen ≤ 0` | `frieden -1` |
| `schoepfung ≤ -2` **und** `gerechtigkeit ≤ -1` | `frieden -1` |
| `gerechtigkeit ≤ -3` **und** `frieden ≤ 0` | `frieden -1` |
| `macht > 0` bei einer Entscheidung | `schoepfung -1` (automatisch in `getAppliedRoundEffect()`) |

---

## BalanceEffect – Effektstruktur

```typescript
type BalanceEffect = Partial<Record<'nutzen'|'gerechtigkeit'|'frieden'|'schoepfung'|'autonomie'|'macht', number>>
```

Jede `DecisionOption` hat ein `effects`-Objekt. Beim Rundenabschluss wird:
1. `getAppliedRoundEffect(effects)` aufgerufen → ergänzt automatischen Schöpfungsmalus bei Macht-Zuwachs
2. Sonderfähigkeiten können Effekte noch modifizieren (Juristin, Bürger:in)
3. `applyEffect(state, appliedEffect)` ändert die Werte, dabei werden Min/Max-Grenzen eingehalten

---

## VotePhaseKey – Phasen-Identität

Der `phaseKey` ist die eindeutige ID einer Abstimmungsrunde:

```
round-0:base          (erster Fall, normale Abstimmung)
round-0:tie-break-1   (erster Fall, erste Stichwahl)
round-0:tie-break-2   (erster Fall, zweite Stichwahl)
round-1:base          (zweiter Fall, normale Abstimmung)
...
```

Wird verwendet:
- Als Schlüssel in `acceptedVotesByPhase` (HostAuthority)
- In jedem `vote-cast`-Event zur Validierung
- In `getCurrentVotePhaseKey()` für lokale State-Checks

---

## PaktSubmission und PaktArticleVote

```typescript
interface PaktSubmission {
  roleId: string;
  playerId: string;
  answers: Record<PaktArticleId, string>; // 5 Artikel: 'artikel-1' bis 'artikel-5'
  submittedAt: number;
}

interface PaktArticleVote {
  articleId: PaktArticleId;
  votedByRoleId: string;
  votedByPlayerId: string;
  twoPointsRoleId: string;  // Wer bekommt 2 Punkte
  onePointRoleId: string;   // Wer bekommt 1 Punkt
  submittedAt: number;
}
```

### Pakt-Ablauf
```
paktSubmissionsByRole      → wird von jeder Rolle befüllt
   ↓ haveAllActiveRolesSubmittedPakt() = true
paktArticleVotesByArticle  → wird von jeder Rolle pro Artikel befüllt (nur wenn ≥ 3 Rollen)
   ↓ haveAllActiveRolesCompletedPaktVoting() = true
deriveResolvedPakt()       → berechnet Gewinner, baut finalPakt
   ↓
state.pakt                 → finaler Text pro Artikel
state.paktWinnersByArticle → welche Rollen haben welchen Artikel gewonnen
```

### deriveArticleWinnerRoleIds – Punkteauszählung
1. Alle Votes für einen Artikel sammeln
2. 2-Punkte-Vergaben: +2 pro Vote
3. 1-Punkt-Vergaben: +1 pro Vote
4. Alle Rollen sortiert nach Punkten (Rangfolge)
5. Ties werden gemeinsam eingetragen
6. Bei 2 Rollen: Keine Scoring-Phase, beide Texte erscheinen

---

## StateSnapshot – Transport-Repräsentation

Der `StateSnapshot` wird über das Relay übertragen und dient allen Clients als Basis für die Resynchronisation:

```typescript
interface StateSnapshot {
  state: GameState;
  lastAppliedSeqByPlayer: Record<string, number>; // höchste bekannte Seq je Player
  roleOwners: Record<string, string>;             // roleId → playerId
  phaseStartedAt?: number | null;                 // Zeitstempel Phasen-Start (für Timer-Sync)
  pendingRoundClose?: PendingRoundCloseState | null; // offener Rundenabschluss
}
```

Der Host baut `StateSnapshot` via `getMergedSnapshot()` in `HostAuthority`, das:
1. Den lokalen Host-`GameState` als Basis nimmt
2. Autorisierte Votes (`acceptedVotesByPhase`) **überschreiben** `state.roundVotes`
3. Autorisierte Pakt-Submissions und -Votes einmergt
4. Nächste Rolle aus dem letzten akzeptierten Vote ableitet (nicht aus möglicherweise driftendem `currentRoleIndex`)
5. `deriveResolvedPakt()` anwendet

---

## Transiente UI-Variablen (in main.ts, nicht in GameState)

Diese Variablen sind nicht Teil des serialisierbaren Spielzustands:

| Variable | Typ | Bedeutung |
|---|---|---|
| `pendingDecision` | `DecisionOption \| null` | Entscheidung wartet auf Bestätigung via Overlay |
| `pendingOverlayAction` | `string` | Was nach Overlay-OK passiert: `render-case`, `apply-round`, `advance-after-round`, `none` |
| `pendingSystemicNotes` | `string[]` | Systemische Hinweise warten auf Anzeige |
| `pendingMultiplayerRequest` | `{...} \| null` | Laufende Relay-Anfrage mit Recovery-Timer |
| `queuedMultiplayerVote` | `QueuedMultiplayerVote \| null` | Lokale Vormerkung für Nicht-aktive Rolle |
| `multiplayerQueueNotice` | `string` | Hinweistext bei Stichwahl-Verwurf der Vormerkung |
| `multiplayerStatusMessage` | `string` | Statuszeile Relay-Verbindung |
| `currentPhaseStartedAt` | `number \| null` | Zeitstempel für Timer-Synchronisation |
| `timedCaseIndex` | `number \| null` | Welcher Fall hat den laufenden Timer |
| `timedPhaseKey` | `string \| null` | Welche Phase hat den laufenden Timer |
| `localStartMode` | `string` | `singleplayer` / `multidevice` |

---

## Kanonische Rollen-Reihenfolge

Rollen werden immer in der in `src/game/data/roles.ts` definierten Reihenfolge sortiert, unabhängig davon, in welcher Reihenfolge sie gewählt wurden:

1. `theologin` – Theolog:in
2. `entwicklerin` – KI-Entwickler:in
3. `juristin` – Jurist:in
4. `sozialarbeiterin` – Sozialarbeiter:in
5. `buergerin` – Bürger:innenvertretung
6. `prophetin` – Prophetische Stimme

`sortRolesByCanonicalOrder()` in `src/game/engine/roles.ts` erzwingt diese Reihenfolge bei jedem `addActiveRoleById()` und `assignRole()`.
