# Genesis-Projekt – Debug-Guide

## Schnell-Referenz: URL-Parameter

| URL-Parameter | Effekt |
|---|---|
| `?dev` | Developer-Mode: Rohe Zahlenwerte statt Labels, DEV-Badge im Status |
| `?debug=1` | Multiplayer-Debug-Panel sichtbar (nur im Multiplayer-Modus) |
| `?mp=host` | Browser wird Host |
| `?mp=join` | Browser wird Client |
| `?timing=kurz` | Kurze Timer (schnelle Tests) |

Kombinierbar: `http://localhost:4173/?mp=host&game=genesis-test&relay=ws://localhost:7000/&debug=1&dev`

---

## Debug-Panel (Multiplayer)

Das Debug-Panel erscheint nur wenn `?debug=1` in der URL und Multiplayer aktiv (`?mp=host` oder `?mp=join`).

### Was im Panel zu sehen ist

- **Zeitstempel** jedes Events (HH:MM:SS)
- **Kanal-Farbe:**
  - `info` (blau): neutrale Events wie State-Syncs, Status-Meldungen
  - `error` (rot): Fehler, Rejections, Timeouts
  - `warning` (gelb): Unerwartete Situationen, Verworfenes
  - `success` (grün): Bestätigte Aktionen
- **Label** + **Detail** mit Event-Typ und Context
- **Duration** (ms) wie lange der Request auf Bestätigung gewartet hat
- **Meta-Zeile:** Recovery-Timeout, Join-Sync-Delay, Host/Client

### Panel-Einschränkungen

- Maximal 50 Einträge (älteste werden verworfen)
- Panel dupliziert sich auf dem Rollenauswahl- und dem Spielscreen
- HTML-Injection durch `innerHTML` ist möglich wenn `entry.detail` aus Netzwerkdaten stammt → in Produktion niemals aktivieren

---

## Developer-Mode (`?dev`)

Mit `?dev` in der URL:
- Stadtbilanz-Werte zeigen Rohzahlen: `+2`, `-1`, `0` statt `Gut`, `Kritisch`
- Macht zeigt numerisch: `5 / 10` statt `Moderat`
- Status-Zeile zeigt `· DEV`-Badge
- Entscheidungsinfo-Box zeigt `Rohwerte sichtbar` statt `Folgen als Tendenzen`
- Voting-Optionen im Multiplayer zeigen den `optionId`-Wert

---

## Browser-Console: Schlüssel-Objekte inspizieren

Im Browser-Devtools-Fenster sind folgende Prüfungen sinnvoll:

### Spielzustand abrufen
```javascript
// State ist nicht direkt exponiert, aber über das window-Objekt erreichbar
// wenn DEVELOPER_MODE aktiv:
// state-Dump über Keyboard-Shortcut (falls implementiert)

// Alternativ: Breakpoint in renderCase() setzen
// dann den lokalen 'state' in der Closure inspizieren
```

### Multiplayer-Laufzeit inspizieren
```javascript
// Nicht direkt exposiert – Breakpoint in handleMultiplayerTransportEvent() setzen
// 'event' enthält den vollständigen TransportEvent
// 'multiplayer' zeigt RelayMultiplayerRuntime mit session, roleOwners, isHost
```

### StateSnapshot aus state-sync analysieren
```javascript
// In handleMultiplayerTransportEvent(), case 'state-sync-sent':
// event.snapshot.state      → vollständiger GameState
// event.snapshot.roleOwners → wer besitzt welche Rolle
// event.snapshot.lastAppliedSeqByPlayer → bekannte Seq-Nummern
```

---

## Breakpoints – Wo was debuggen

### Stimme wird nicht gesendet oder ignoriert

| Symptom | Breakpoint |
|---|---|
| Klick auf Option zeigt keine Reaktion | `submitMultiplayerVote()` → prüfe ob `pendingMultiplayerRequest` bereits gesetzt |
| Vote wird gesendet aber nie angenommen | `HostAuthority.handleVoteCastRequested()` → prüfe `resolveVoteCast()` Rückgabe |
| Vote kommt zurück aber UI aktualisiert nicht | `applyAcceptedVote()` → prüfe `castVote()` Rückgabe und `advanceToNextRole()` |
| Doppelter Vote-Submit | `maybeAutoSubmitQueuedVote()` → prüfe `pendingVoteNotYetConfirmed`-Guard |

**In `resolveVoteCast()` prüfen:**
- `roundId` des Events vs. `getCurrentRoundId(snapshot.state)` → `ROUND_MISMATCH`
- `phaseKey` des Events vs. `getCurrentVotePhaseKey(snapshot.state)` → `PHASE_MISMATCH`
- `acceptedVotesByPhase[phaseKey][roleId]` bereits belegt → `ALREADY_VOTED`
- `acceptedRoleOwners[roleId] !== event.actorPlayerId` → `ROLE_NOT_OWNED`

---

### Falscher Spieler ist am Zug

| Symptom | Breakpoint |
|---|---|
| Nächste Rolle wird übersprungen | `getMergedSnapshot()` → `getNextPendingRole(nextRoleSourceState)` |
| Reihenfolge driftet nach Reconnect | `getMergedSnapshot()` → `latestAcceptedVote` korrekt? `latestAcceptedRoleIndex` ≥ 0? |
| `currentRoleIndex` und tatsächliche Rolle stimmen nicht überein | Alle Aufrufe von `advanceToNextRole()` in `applyAcceptedVote()` |

**Key-Check in getMergedSnapshot():**
```typescript
// Dieser Block bestimmt nächste Rolle anhand LETZTER AKZEPTIERTER Stimme:
const latestAcceptedVote = acceptedVotes.reduce(...);
// → latestAcceptedVote.roleId muss die zuletzt abgestimmte Rolle sein
// → latestAcceptedRoleIndex muss ≥ 0 sein (Rolle ist in activeRoles[])
```

---

### Runde schließt sich nicht

| Symptom | Breakpoint |
|---|---|
| Alle Rollen haben abgestimmt, aber kein Ergebnis | `continueHostMultiplayerRoundIfReady()` → `haveAllActiveRolesVoted()` prüfen |
| `round-closed(requested)` wird gesendet, aber rejected | `HostAuthority.handleRoundClosedRequested()` → `resolveRoundClosed()` |
| `INCOMPLETE_VOTES` rejection | `acceptedVotesByPhase[phaseKey]` keys vs. `acceptedRoleOwners` keys |
| `INVALID_RESULT` rejection | `determineRoundDecision(snapshot.state)` stimmt nicht mit `event.resolvedOptionId` überein |

---

### Pakt finalisiert sich nicht

| Symptom | Breakpoint |
|---|---|
| Pakt-Screen erscheint nicht | `haveAllActiveRolesSubmittedPakt(state)` prüfen |
| Pakt-Voting startet nicht | `isPaktScoringRequired(state)` – false wenn < 3 Rollen |
| Pakt-Ergebnis fehlt | `deriveResolvedPakt(state)` → `paktArticleVotesByArticle` vollständig? |
| `haveAllActiveRolesCompletedPaktVoting()` bleibt false | Alle Artikel haben Votes aller aktiven Rollen? |

---

### Relay-Verbindungsprobleme

| Symptom | Ursache |
|---|---|
| "Relay nicht erreichbar" | WebSocket-URL prüfen: `toRelayWebSocketUrl(relayUrl)` |
| Events erscheinen doppelt | Subscription läuft mehrfach – `seenEventIds` prüfen |
| Keine Events obwohl Relay läuft | `gameId` in URL und Subscription-Filter übereinstimmend? |
| Host sieht keine Clients | `?game=` Parameter muss identisch sein |
| "Relay-Verbindung instabil" | Relay-Prozess auf `localhost:7000` läuft? |

**Relay-URL-Konvertierung prüfen:**
```javascript
// In Browser-Console (DevTools):
// toRelayWebSocketUrl ist nicht global – prüfe in Netzwerk-Tab
// ob WebSocket-Verbindung zu ws:// oder wss:// aufgebaut wurde
```

---

### Recovery-Timeout feuert zu früh / zu spät

Recovery-Timeout = 900 ms (in `src/config.ts`).

| Situation | Erklärung |
|---|---|
| Recovery feuert, obwohl Relay reagiert | Relay zu langsam, `recoveryTimeoutMs` erhöhen |
| Recovery feuert nie | `clearPendingMultiplayerRequest()` wurde aufgerufen, bevor accepted/rejected kam |
| Recovery-Loop (ständige Syncs) | `pendingMultiplayerRequest` wird nicht gelöscht nach State-Sync |

**Prüfen ob Recovery-Loop besteht:**
- Debug-Panel zeigt wiederholte "Recovery-Sync" + "State-Sync" Einträge ohne dazwischen liegende accepted-Events
- Breakpoint in `clearPendingMultiplayerRequest()` prüft ob und wann aufgerufen

---

## Typische Fehlerszenarien

### Szenario 1: Client bleibt auf "Synchronisiere..."

**Symptom:** Status zeigt "Synchronisiere nächsten Zug · 2/3 Stimmen", obwohl alle abgestimmt haben.

**Diagnose:**
1. Hat der Host `round-closed(accepted)` gesendet? → Debug-Panel prüfen
2. Hat der Client das Event empfangen? → Network-Tab WebSocket-Frame prüfen
3. War das Event in `seenEventIds`? → Duplizierungscheck
4. `applyAcceptedRoundClose()` aufgerufen? → Breakpoint setzen
5. `showConsequence()` aufgerufen? → Breakpoint setzen

---

### Szenario 2: Abstimmungsreihenfolge springt nach Reconnect

**Symptom:** Nach Neu-Verbindung ist Rolle A erneut am Zug, obwohl Rolle B dran wäre.

**Diagnose:**
1. `getMergedSnapshot()` Breakpoint: welchen `latestAcceptedVote` findet er?
2. Sind die Votes in `acceptedVotesByPhase[phaseKey]` vollständig?
3. Hat der Reconnect-Client den richtigen `phaseKey`?
4. `getNextPendingRole()` mit welchem `currentRoleIndex` aufgerufen?

---

### Szenario 3: Vormerkung führt zu Doppel-Submit

**Symptom:** Host lehnt Vote ab mit `ALREADY_VOTED`, obwohl Client glaubt, noch nicht abgestimmt zu haben.

**Diagnose:**
1. War `pendingVoteNotYetConfirmed` im State-Sync-Handler false?
2. Wurde `clearPendingMultiplayerRequest()` zu früh aufgerufen?
3. Hat `maybeAutoSubmitQueuedVote()` einen erneuten Submit ausgelöst?
4. Prüfe `pendingMultiplayerRequest?.kind === 'vote'` Bedingung

**Fix-Ort:** `handleMultiplayerTransportEvent()`, case `'state-sync-sent'`:
```typescript
const pendingVoteNotYetConfirmed =
  pendingMultiplayerRequest?.kind === 'vote' &&
  localOwnedRole != null &&
  !event.snapshot.state.roundVotes[localOwnedRole.id];
if (!pendingVoteNotYetConfirmed) {
  clearPendingMultiplayerRequest();
}
```

---

### Szenario 4: Pakt-Ergebnis fehlt

**Symptom:** Pakt-Finale-Screen zeigt leere Texte.

**Diagnose:**
1. `state.pakt` leer? → `deriveResolvedPakt()` geprüft?
2. `state.paktWinnersByArticle` leer? → `deriveArticleWinnerRoleIds()` aufgerufen?
3. Nur 2 Rollen? → `isPaktScoringRequired()` = false, kein Voting
4. Pakt-Voting übersprungen? → `haveAllActiveRolesCompletedPaktVoting()` = true ohne Votes?

---

## Tests ausführen

```bash
# Alle Tests einmalig
npx vitest run

# Tests im Watch-Modus
npx vitest

# Nur Transport-Tests
npx vitest run tests/transport.test.ts

# Nur Engine-Tests
npx vitest run tests/engine.test.ts
```

### Was die Tests abdecken

| Test-Datei | Abdeckung |
|---|---|
| `tests/engine.test.ts` | Voting, Rundenauswertung, Rollenvergabe, Sonderfähigkeiten, Bilanzwertung |
| `tests/transport.test.ts` | HostAuthority, getMergedSnapshot(), Vote-Validierung, Turn-Order-Fix |
| `tests/pakt.test.ts` | Pakt-Submission, Artikel-Wertung, deriveResolvedPakt() |

### Regression für Turn-Order-Fix

In `tests/transport.test.ts`:
```
"leitet bei state-sync den naechsten Zug vom zuletzt akzeptierten Vote ab"
```
Dieser Test stellt sicher, dass `getMergedSnapshot()` den nächsten Zug immer korrekt aus dem letzten akzeptierten Vote ableitet, auch wenn der Host-State einen anderen `currentRoleIndex` hätte.

---

## Log-Einträge in pushMultiplayerDebugEntry

Alle Stellen in `main.ts` die Debug-Einträge erzeugen:

| Auslöser | Label-Muster | Kanal |
|---|---|---|
| `handleMultiplayerTransportEvent` – `game-created` | "Spiel erstellt" | info |
| `handleMultiplayerTransportEvent` – `role-claimed accepted` | "Rolle vergeben" | success |
| `handleMultiplayerTransportEvent` – `role-claimed rejected` | "Rolle abgelehnt" | error |
| `handleMultiplayerTransportEvent` – `vote-cast accepted` | "Stimme bestätigt" | success |
| `handleMultiplayerTransportEvent` – `vote-cast rejected` | "Stimme abgelehnt" | error |
| `handleMultiplayerTransportEvent` – `state-sync-sent` | "State-Sync empfangen" | info |
| `handleMultiplayerTransportEvent` – `round-closed accepted` | "Runde abgeschlossen" | success |
| Recovery-Timeout | "Recovery-Sync" | warning |
| Manueller Sync | "Manueller Sync" | info |
| Relay-Verbindungsproblem | "Relay-Problem" | error |

---

## Hilfreiche Invarianten zum Verifizieren

Wenn etwas unerwartet läuft, diese Invarianten prüfen:

1. **`state.activeRoles` immer kanonisch sortiert** – `sortRolesByCanonicalOrder()` nach jeder Rollenzuweisung
2. **`state.roundVotes` Schlüssel sind roleIds** – kein Player-Namespace
3. **`phaseKey` in Vote und Snapshot identisch** – `getCurrentVotePhaseKey(state)` auf beiden Seiten
4. **`lastAppliedSeqByPlayer` aller Clients wächst monoton** – nie kleiner werden
5. **`acceptedVotesByPhase` auf dem Host** ist die einzige Wahrheit – alles andere ist lokal
6. **Ephemere Keys verschwinden** nach Tab-Schließen – `playerId` ändert sich bei frischer Navigation
7. **`queuedMultiplayerVote.phaseKey` muss zur aktuellen Phase passen** – bei Stichwahl wird Queue verworfen
