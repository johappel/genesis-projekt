# AGENTS.md – Genesis-Projekt

## Projektstatus

Die Migration aus `Spiel-A.html` ist abgeschlossen. Das Spiel läuft als vollständige Vite-TypeScript-Anwendung mit:

- Single-Device-Modus (Singleplayer und mehrere Personen am selben Gerät)
- Multiplayer über Nostr-Relay (3-Spieler-Betrieb bestätigt, host-autoritativ)
- 7 spielbaren Fällen, 6 Rollen, 9 Enden, Pakt-Finale
- 65 automatisierten Tests (Vitest), alle grün

`Spiel-A.html` verbleibt im Repository als Referenz, wird aber nicht mehr gepflegt.

---

## Dokumentation – Pflichtlektüre vor jedem Patch

Vor jeder Änderung die relevante Dokumentation lesen:

| Dokument | Inhalt |
|---|---|
| `docs/game-flow.md` | Vollständiger Spielfluss, alle Phasen, alle Trigger und Übergänge |
| `docs/state-model.md` | Komplettes `GameState`-Modell, alle Felder, Startwerte, Werteskalen |
| `docs/multiplayer-transport.md` | Alle 13 Transport-Events, Validierungsregeln, Timing, `getMergedSnapshot()` |
| `docs/debugging.md` | Breakpoints, typische Fehlerszenarien, URL-Parameter, Invarianten |
| `docs/tasks_0001.md` | Aktuell offene Aufgaben |

Dokumentation muss aktuell gehalten werden: Wer eine Funktion, ein Feld oder ein Event ändert, aktualisiert die entsprechende Doku im selben Patch.

---

## Architektur – aktueller Zustand

```
src/
  main.ts                  ← UI-Orchestrator, ~3200 Zeilen (kein Framework)
  config.ts                ← Zentrale Konfiguration (Relay-URL, Multiplayer-Timing)
  style.css
  game/
    types.ts               ← Alle Spieltypen (GameState, Role, Lens, ...)
    config.ts              ← Spielkonstanten (Timerwerte, Schwellen)
    data/
      roles.ts             ← 6 Rollen mit Sonderfähigkeiten
      cases.ts             ← 7 Fälle mit Entscheidungsoptionen und Effekten
      lenses.ts            ← Analyse-Linsen
      endings.ts           ← 9 Enden mit Bedingungen
      balance.ts           ← Startwerte, Skalen, Schwellen, Labels
      facts.ts             ← Fakten- und Quellenmodell
      uiText.ts            ← Alle UI-Texte
    engine/
      createGame.ts        ← createGame() → serialisierbarer Startzustand
      roles.ts             ← assignRole(), sortRolesByCanonicalOrder()
      voting.ts            ← castVote(), determineRoundDecision(), beginTieBreak(), getNextPendingRole()
      rounds.ts            ← closeRound(), getAppliedRoundEffect(), applySystemicConsequences()
      pakt.ts              ← Pakt-Submission, Pakt-Voting, deriveResolvedPakt()
    rules/
      abilities.ts         ← Sonderfähigkeiten-Prüflogik
  transport/
    types.ts               ← TransportEvent, StateSnapshot, alle Event-Typen
    session.ts             ← Ephemere Session, Schlüsselgenerierung, Reload-Wiederverwendung
    eventFactory.ts        ← TransportEventFactory mit Seq-Zähler
    localBus.ts            ← Lokaler Mock-Transport (für Tests)
    nostrRelayBus.ts       ← Nostr-Relay via nostr-tools SimplePool
    hostAuthority.ts       ← HostAuthority: Validierung, acceptedVotesByPhase, getMergedSnapshot()
    runtime.ts             ← RelayMultiplayerRuntime: Event-Routing, Recovery, Role-Ownership

tests/
  abilities.test.ts
  cases-balance.test.ts
  createGame.test.ts
  endings.test.ts
  game-config.test.ts
  nostr-relay-smoke.test.ts
  roles.test.ts
  rounds.test.ts
  transport.test.ts        ← enthält Regression für Turn-Order-Fix in getMergedSnapshot()
  voting.test.ts

docs/                      ← Pflichtige Spezifikation und Debug-Guides
index.html                 ← Einzel-HTML, alle Screens per CSS togglebar
```

---

## Invarianten – dürfen durch keinen Patch verletzt werden

Diese Regeln sind durch Tests und Architektur abgesichert. Vor und nach jedem Patch prüfen:

### Engine-Invarianten

1. **Engine-Funktionen sind pure.** `castVote()`, `closeRound()`, `assignRole()`, `determineRoundDecision()`, `deriveResolvedPakt()` und alle anderen Engine-Funktionen in `src/game/engine/` empfangen State und geben neuen State zurück. Sie lesen keinen globalen State, mutieren kein DOM, schreiben kein Storage.

2. **Werte werden erst bei `closeRound()` verändert.** Kein Code-Pfad darf `state.values` oder `state.macht` außerhalb von `closeRound()` → `applyEffect()` ändern. Sonderfähigkeiten modifizieren den `BalanceEffect` vor dem Aufruf, nicht danach.

3. **`state.activeRoles` ist immer kanonisch sortiert.** `sortRolesByCanonicalOrder()` muss nach jeder Rollenzuweisung aufgerufen werden. Die Reihenfolge ist die Reihenfolge in `src/game/data/roles.ts`.

4. **`state.roundVotes` Schlüssel sind roleIds, nicht playerIds.** Kein Namensraum-Mischen.

5. **`state.currentCase` zählt nur aufwärts.** Kein Zurückspringen in abgeschlossene Fälle.

6. **`GameState` bleibt JSON-serialisierbar.** Keine Funktionen, keine zirkulären Referenzen, keine DOM-Elemente im State.

### Multiplayer-Invarianten

7. **Der Host ist die einzige Wahrheitsquelle.** Clients wenden Effekte erst nach einem `accepted`-Event an. `state`-Änderungen auf Client-Seite aus `requested`-Events sind verboten.

8. **`getMergedSnapshot()` leitet den nächsten Zug vom letzten akzeptierten Vote ab**, nicht von `currentRoleIndex` des Host-State. Dieser Fix verhindert Turn-Order-Drift nach Reconnects. Regression: `tests/transport.test.ts` → "leitet bei state-sync den naechsten Zug vom zuletzt akzeptierten Vote ab".

9. **`phaseKey` und `roundId` müssen in jedem Vote-Event übereinstimmen.** Ein Vote mit falschem `phaseKey` (z.B. aus einer abgelaufenen Stichwahl) wird mit `PHASE_MISMATCH` abgelehnt.

10. **`clearPendingMultiplayerRequest()` darf im `state-sync-sent`-Handler nicht aufgerufen werden, wenn ein Vote in-flight ist und der Snapshot die Stimme noch nicht enthält.** Guard in `handleMultiplayerTransportEvent()` → case `'state-sync-sent'`:
    ```typescript
    const pendingVoteNotYetConfirmed =
      pendingMultiplayerRequest?.kind === 'vote' &&
      localOwnedRole != null &&
      !event.snapshot.state.roundVotes[localOwnedRole.id];
    if (!pendingVoteNotYetConfirmed) {
      clearPendingMultiplayerRequest();
    }
    ```
    Dieser Guard verhindert Doppel-Submits durch vorgemerkte Votes. Nicht entfernen.

11. **Keine persistenten privaten Nostr-Schlüssel.** `session.ts` generiert ephemere Keys. Bei Reload wird Session aus `sessionStorage` wiederverwendet. Bei frischer Navigation (neuem Tab) neue Session. Keine `nsec`-Werte in Git, Logs, Tests oder Dokumentation.

12. **Eingehende Relay-Events deduplizieren.** `RelayMultiplayerRuntime` hält `seenEventIds`. Jeder Event-Handler muss davon ausgehen, dass ein Event mehrfach zugestellt werden kann.

### UI-Invarianten

13. **Keine Bilanzlogik in `main.ts`.** `main.ts` ruft Engine-Funktionen auf und rendert deren Ergebnis. Wertberechnungen gehören nach `src/game/engine/`.

14. **Kein unvalidiertes innerHTML aus Netzwerkdaten.** `pushMultiplayerDebugEntry()` mit `innerHTML` ist nur für Debug-Panel (`?debug=1`) zugelassen. Spielzustand und Relay-Inhalte dürfen niemals direkt als HTML gerendert werden.

15. **Transiente UI-Variablen gehören nicht in `GameState`.** `pendingDecision`, `pendingMultiplayerRequest`, `queuedMultiplayerVote`, Timer-IDs und `pendingOverlayAction` sind lokale `let`-Variablen in `main.ts`, nicht Teil des serialisierbaren Zustands.

---

## Wo was geändert wird

| Änderung | Dateien |
|---|---|
| Spielinhalt (Texte, Fälle, Rollen) | `src/game/data/` |
| Balancing-Werte, Schwellen | `src/game/data/balance.ts`, `src/game/data/cases.ts` |
| UI-Texte | `src/game/data/uiText.ts` |
| Spielregeln (Voting, Runden, Sonderfähigkeiten) | `src/game/engine/`, `src/game/rules/` |
| Neue Screens, UI-Flows | `main.ts` + `index.html` |
| Multiplayer-Validierung | `src/transport/hostAuthority.ts` |
| Relay-Verbindung, Session | `src/transport/nostrRelayBus.ts`, `src/transport/session.ts` |
| Timing-Konfiguration | `src/config.ts` |
| Neue Transport-Events | `src/transport/types.ts` + `src/transport/eventFactory.ts` + `src/transport/hostAuthority.ts` + `main.ts` |

---

## Bevor du einen Patch einreichst

1. **Tests laufen lassen:** `npx vitest run` – alle 65 müssen grün sein.
2. **Build prüfen:** `npm run build` – kein TypeScript-Fehler, keine Vite-Fehler.
3. **Relevante Invarianten (oben) für den geänderten Bereich durchlesen.**
4. **Dokumentation aktualisieren** wenn du ein Feld, eine Funktion oder ein Event änderst.
5. **Neue Spielregeln zuerst testen**, dann implementieren.

---

## Sicherheits- und Reputationsregeln

- Keine dauerhaften privaten Nostr-Schlüssel im Browser speichern.
- Keine realen personenbezogenen Daten für Spielbeitritt, Rollenwahl oder Abstimmung verlangen.
- Nur temporäre Sitzungsschlüssel verwenden (`src/transport/session.ts`).
- Keine echten `nsec`-Werte in Git, Logs, Screenshots, Testdaten oder Dokumentation ablegen.
- Keine geheimen Relay-Zugangsdaten committen.
- Eingehende Multiplayer-Events müssen gegen aktuellen Spielstatus, Rollenbesitz und Rundennummer validiert werden – nie blind vertrauen.
- Replay- und Doppelabstimmungen müssen verhindert werden (phaseKey-Prüfung, seenEventIds).
- Bei Inhalten zu autonomen Waffen, Diskriminierung, Triage, Bildung, Überwachung und Gesundheitsdaten: verantwortungsvoll formulieren, Reputationsrisiken markieren.
- Ethische und wissenschaftliche Aussagen sind Spielnarrativ, keine gesicherten Fakten – in `src/game/data/facts.ts` mit `status: 'needs-source'` oder `'fictional'` markieren.

---

## Technische Qualitätskriterien

- Engine-Funktionen als pure Funktionen.
- Spielzustand JSON-serialisierbar.
- Tests für jede neue Spielregel vor der Implementierung.
- Keine Logik an DOM-IDs koppeln.
- Kein globaler Mutable-State außerhalb von `main.ts`.
- UI auf Desktop, Tablet und Mobil nutzbar.
- Texte deutsch, klar, didaktisch belastbar.

---

## Arbeitsstil

- Kleine, nachvollziehbare Änderungen bevorzugen.
- Vor größeren Architekturentscheidungen die Annahme in `docs/` dokumentieren.
- Offene Tasks in `docs/tasks_0001.md` sichtbar halten.
- Bei theologischen, ethischen oder wissenschaftlichen Aussagen zwischen Spielnarrativ, Werturteil und belegbarer Tatsache unterscheiden.
