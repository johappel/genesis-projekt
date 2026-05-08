# Genesis-Projekt – Multiplayer und Transport

## Architekturüberblick

```
Browser (Host)                    Browser (Client 1)         Browser (Client 2)
      │                                  │                          │
RelayMultiplayerRuntime                  │                          │
  ├── HostAuthority                      │                          │
  │     └── akzeptiert/verwirft Events   │                          │
  └── NostrRelayBus ──────── Nostr-Relay (WebSocket) ──────────────┘
         (publish/subscribe)
```

**Kernprinzip: Host-Autoritativ**  
Nur der Host darf Spielaktionen bestätigen. Alle Clients senden `requested`-Events, der Host antwortet mit `accepted` oder `rejected`. Clients wenden Änderungen erst nach `accepted` an.

---

## Komponenten

### RelayMultiplayerRuntime (`src/transport/runtime.ts`)
- Wird in `main.ts` instanziiert, wenn URL-Parameter `?mp=host` oder `?mp=join` vorhanden
- Besitzt `HostAuthority` (nur wenn `mode === 'host'`)
- Besitzt `NostrRelayBus` für WebSocket-Verbindung
- Besitzt `TransportEventFactory` für Event-Erstellung mit eigenem Seq-Zähler
- Besitzt `session: EphemeralTransportSession` mit `playerId`, `pubkey`, `secretKey`
- Leitet empfangene Events über `listeners` an `main.ts` weiter (`handleMultiplayerTransportEvent()`)
- Dedupliziert Events via `seenEventIds` (per `messageId` oder `actorPubkey:seq`)

### HostAuthority (`src/transport/hostAuthority.ts`)
- Nur auf dem Host-Browser aktiv
- Subscribed auf alle Events im Raum
- Validiert eingehende `requested`-Events und publiziert `accepted`/`rejected`
- Verwaltet autoritative Zustandskopien:
  - `acceptedRoleOwners`: Wer besitzt welche Rolle
  - `acceptedVotesByPhase[phaseKey][roleId]`: Bestätigte Stimmen
  - `acceptedLensSelectionsByRound[roundId]`: Bestätigte Linse
  - `acceptedPaktSubmissionsByRole[roleId]`: Bestätigte Pakt-Beiträge
  - `acceptedPaktVotesByArticle[articleId][roleId]`: Bestätigte Pakt-Wertungen
  - `closedRounds`: Set abgeschlossener Runden (verhindert Doppelabschluss)
- `getMergedSnapshot()`: Baut `StateSnapshot` aus lokalem Host-State + autoritativen Overrides

### NostrRelayBus (`src/transport/nostrRelayBus.ts`)
- Verwendet `nostr-tools` `SimplePool` für WebSocket-Verbindung
- Sendet JSON-serialisierte `TransportEvent`-Objekte als Nostr-Kind-1-Events
- Event-Inhalt wird mit dem ephemeren `secretKey` signiert
- `toRelayWebSocketUrl()`: Konvertiert `http://` → `ws://`, `https://` → `wss://`
- Retry-Logik: 4 Versuche, 80 ms Abstand (`publishRetryAttempts`, `publishRetryDelayMs`)
- Subscription-Retry: 150 ms Verzögerung bei Verbindungsproblemen

### TransportEventFactory (`src/transport/eventFactory.ts`)
- Pro Instanz privater Seq-Zähler (incrementiert bei jedem Event)
- Host-Authority und RelayMultiplayerRuntime haben **getrennte** Instanzen, also getrennte Seq-Zähler
- `actorPubkey` wird aus Session-ClientInfo gesetzt

### EphemeralTransportSession (`src/transport/session.ts`)
- Generiert bei Spielstart ephemere Nostr-Keys (`generateSecretKey()`, `getPublicKey()`)
- Session wird in `sessionStorage` gepersistiert (für Reload/Back-Forward Navigation)
- Bei **frischer Navigation** (Tippen der URL, Link) wird neue Session generiert → neuer `playerId`
- `shouldReusePersistedSession()` prüft `performance.getEntriesByType('navigation')[0].type`

---

## Event-Protokoll: Vollständiger Ablauf

### Sequence Diagram: Rollenbeitritt

```
Client                    Relay                    Host
  │                         │                        │
  │──role-claimed(requested)→│                        │
  │                         │──role-claimed(requested)→│
  │                         │                        │ handleRoleClaimRequested()
  │                         │                        │ resolveRoleClaim(): ok?
  │                         │←─role-claimed(accepted)──│
  │←─role-claimed(accepted)──│                        │
  │ addActiveRoleById()      │                        │ acceptedRoleOwners[roleId] = playerId
  │                         │                        │ scheduleFollowupStateSync() (45ms)
  │                         │←────state-sync-sent─────│
  │←───state-sync-sent───────│                        │
  │ applySnapshot()          │                        │
```

### Sequence Diagram: Stimme abgeben

```
Client                    Relay                    Host
  │                         │                        │
  │──vote-cast(requested)──→│                        │
  │ pendingMultiplayerRequest│──vote-cast(requested)──→│
  │   = { kind:'vote' }     │                        │ handleVoteCastRequested()
  │                         │                        │ resolveVoteCast(): phaseKey ok? Rolle besetzt? Schon abgestimmt?
  │                         │←──vote-cast(accepted)───│
  │←──vote-cast(accepted)────│                        │ acceptedVotesByPhase[phaseKey][roleId] = event
  │ clearPendingRequest()    │                        │ scheduleFollowupStateSync() (45ms)
  │ applyAcceptedVote()      │                        │
  │  castVote()              │←────state-sync-sent─────│
  │  advanceToNextRole()     │                        │
  │←──state-sync-sent────────│                        │
  │ (pendingRequest noch     │                        │
  │  offen? → nicht löschen) │                        │
```

**Wichtig:** `clearPendingMultiplayerRequest()` im `state-sync-sent`-Handler wird übersprungen, wenn ein `vote`-Request noch ausstehend ist **und** der Snapshot die Stimme noch nicht enthält. Dies verhindert Doppel-Submits durch vorgemerkte Votes.

### Sequence Diagram: Rundenabschluss (Host)

```
Host-Browser                Relay                    Clients
  │                         │                        │
  │ continueHostRoundIfReady()                        │
  │──round-closed(requested)→│                        │
  │                         │──round-closed(requested)→│ (Host empfängt eigenes Event)
  │ handleRoundClosedRequested()                      │
  │ resolveRoundClosed(): alle Stimmen? Result korrekt?│
  │──round-closed(accepted)─→│                        │
  │←──round-closed(accepted)──│──round-closed(accepted)→│
  │ applyAcceptedRoundClose() │                        │ applyAcceptedRoundClose()
  │ showConsequence()         │                        │ showConsequence()
```

---

## Alle Transport-Events im Detail

### `game-created`
**Richtung:** Host → alle  
**Auslöser:** `HostAuthority.publishGameCreated()` bei `runtime.start()`  
**Inhalt:** `hostPlayerId`, `rulesVersion`, `maxPlayers`  
**Effekt:** Clients zeigen Status "Relay-Raum aktiv"

### `game-reset`
**Richtung:** Beliebiger Client → Host → alle  
**Status:** `requested` → `accepted`  
**Auslöser:** Reset-Button (sofern implementiert)  
**Effekt:** Alle Clients rufen `applyFreshGameReset()` auf

### `role-claimed`
**Richtung:** Client → Host → alle  
**Status:** `requested` → `accepted`|`rejected`  
**Validierung (Host):**
- Rolle bekannt? (`validRoleIds`)
- Rolle nicht vergeben? (`acceptedRoleOwners`)
- Player hat noch keine Rolle? (max. 1 Rolle pro Player)
- Raum nicht voll? (`maxPlayers`)

**Ablehnungsgründe:** `ROLE_NOT_FOUND`, `ROLE_ALREADY_TAKEN`, `GAME_FULL`, `PLAYER_ALREADY_HAS_ROLE`

### `phase-opened`
**Richtung:** Host → alle  
**Auslöser:** `publishOpenedPhase()` beim Spielstart oder Stichwahl  
**Inhalt:** Vollständiger `StateSnapshot`  
**Effekt:** Alle Clients öffnen `screen-game`, rendern Fall

### `lens-selected`
**Richtung:** Client → Host → alle  
**Status:** `requested` → `accepted`|`rejected`  
**Validierung (Host):**
- Linse bekannt?
- Rolle ist die aktuelle Linsen-Initiative?
- Noch keine Linse für diese Runde gewählt?
- Linse wurde von dieser Rolle noch nicht verwendet?

**Ablehnungsgründe:** `LENS_NOT_FOUND`, `ROLE_NOT_INITIATOR`, `LENS_ALREADY_SELECTED`, `LENS_ALREADY_USED`, `ROLE_NOT_CLAIMED`, `ROLE_NOT_OWNED`, `ROUND_MISMATCH`

### `vote-cast`
**Richtung:** Client → Host → alle  
**Status:** `requested` → `accepted`|`rejected`  
**Validierung (Host):**
- `roundId` stimmt mit aktuellem überein?
- `phaseKey` stimmt mit aktueller Phase überein? (verhindert Votes in alten Stichwahl-Runden)
- Rolle ist geclaimed und gehört dem sendenden Player?
- Rolle hat in dieser Phase noch nicht abgestimmt?

**Ablehnungsgründe:** `ROUND_MISMATCH`, `ROLE_NOT_CLAIMED`, `ROLE_NOT_OWNED`, `ALREADY_VOTED`, `TURN_MISMATCH`

**Besonderheit Timeout-Vote:** Der Host kann per `publishAuthoritativeVote()` direkt eine autoritative Stimme setzen (ohne `requested`-Zyklus) für Timeout-Behandlung.

### `round-closed`
**Richtung:** Host → Host und alle Clients  
**Status:** `requested` → `accepted`|`rejected`  
**Auslöser:** `continueHostMultiplayerRoundIfReady()` nach letzter Stimme  
**Validierung (Host):**
- `roundId` und `phaseKey` korrekt?
- Runde noch nicht geschlossen?
- Alle geclaimten Rollen haben abgestimmt?
- `voteSummary` stimmt mit akzeptierten Stimmen überein?
- `resolvedOptionId` entspricht der tatsächlichen Mehrheit?

**Ablehnungsgründe:** `INCOMPLETE_VOTES`, `INVALID_RESULT`, `ROUND_MISMATCH`, `ROUND_ALREADY_CLOSED`

### `state-sync-requested`
**Richtung:** Client → alle (Host reagiert)  
**Auslöser:**
- Automatisch 80 ms nach `runtime.start()` (Clients)
- Manuell über Sync-Button
- Nach Rejection oder Timeout-Recovery

**Effekt:** Host antwortet mit `state-sync-sent`

### `state-sync-sent`
**Richtung:** Host → alle  
**Auslöser:**
- Antwort auf `state-sync-requested`
- `scheduleFollowupStateSync()` (45 ms nach jeder akzeptierten Aktion)
- `runtime.broadcastStateSync()`

**Inhalt:** Vollständiger `StateSnapshot` aus `getMergedSnapshot()`  
**Effekt:** Clients übernehmen vollständig neuen State, rendern Screen neu

### `pakt-submitted`
**Richtung:** Client → Host → alle  
**Status:** `requested` → `accepted`|`rejected`  
**Validierung (Host):**
- Alle 5 Artikel gefüllt?
- Rolle noch nicht eingereicht?
- Rolle gehört dem sendenden Player?

**Ablehnungsgründe:** `EMPTY_ANSWER`, `PAKT_ALREADY_SUBMITTED`, `ROLE_NOT_CLAIMED`, `ROLE_NOT_OWNED`, `ROUND_MISMATCH`

### `pakt-voted`
**Richtung:** Client → Host → alle  
**Status:** `requested` → `accepted`|`rejected`  
**Validierung (Host):**
- Alle Rollen haben eingereicht?
- Kein Selbstvotum (`twoPointsRoleId !== votedByRoleId`)?
- 2P und 1P an verschiedene Rollen?
- Ziel-Rollen haben tatsächlich eingereicht?
- Noch nicht für diesen Artikel gewertet?
- Bei 2 aktiven Rollen: Wertung nicht erlaubt (`INSUFFICIENT_CANDIDATES`)

**Ablehnungsgründe:** `PAKT_NOT_READY`, `SELF_VOTE`, `DUPLICATE_TARGET`, `SUBMISSION_MISSING`, `ARTICLE_ALREADY_VOTED`, `INSUFFICIENT_CANDIDATES`, `ROLE_NOT_CLAIMED`, `ROLE_NOT_OWNED`, `ROUND_MISMATCH`

---

## Multiplayer-Timing-Konfiguration

Alle Werte in `src/config.ts`:

| Parameter | Wert | Bedeutung |
|---|---|---|
| `initialStateSyncDelayMs` | 80 ms | Wartezeit vor erstem State-Sync-Request (Client-Start) |
| `recoveryTimeoutMs` | 900 ms | Wie lange auf `accepted` gewartet wird vor Recovery-Sync |
| `followupStateSyncDelayMs` | 45 ms | Verzögerung des Host-Snapshots nach jeder Aktion |
| `publishRetryAttempts` | 4 | Anzahl Versuche bei Relay-Publish-Fehler |
| `publishRetryDelayMs` | 80 ms | Wartezeit zwischen Publish-Versuchen |
| `subscriptionRetryDelayMs` | 150 ms | Wartezeit bei Subscription-Wiedereintritt |

---

## pendingMultiplayerRequest – Recovery-System

Wenn ein Client eine Relay-Anfrage sendet, wird ein `pendingMultiplayerRequest` gesetzt:

```typescript
{
  kind: 'vote' | 'round-close' | 'role-claim' | 'lens-select' | 'pakt-submit' | 'pakt-vote',
  startedAt: number,
  label: string,
  timer: setTimeout(recovery, 900)
}
```

**Normaler Ablauf:** `clearPendingMultiplayerRequest()` wenn `accepted`/`rejected` empfangen  
**Recovery:** Nach 900 ms → `requestStateSync()` wird ausgelöst, UI zeigt Fehlerstatus  

**Sonderfall `state-sync-sent` + pendingVote:**  
Wenn ein State-Sync eintrifft und ein Vote-Request noch aussteht, **und** der Snapshot die Stimme nicht enthält, wird `clearPendingMultiplayerRequest()` **nicht** aufgerufen. So wird verhindert, dass `maybeAutoSubmitQueuedVote()` erneut feuert und einen Doppel-Submit auslöst.

---

## Vorgemerkte Stimmen (queuedMultiplayerVote)

```typescript
type QueuedMultiplayerVote = {
  phaseKey: string;   // muss zur aktuellen Phase passen
  caseId: number;
  roleId: string;     // muss zur lokalen Rolle passen
  optionId: string;
  optionText: string;
  isTieBreak: boolean;
}
```

**Gültigkeit:** `getQueuedMultiplayerVote()` gibt nur zurück wenn:
1. `queuedMultiplayerVote` gesetzt
2. Lokale Rolle hat noch nicht abgestimmt (`getLocalPendingRole()`)
3. `phaseKey` stimmt mit aktuellem überein
4. `roleId` stimmt mit lokaler Pending-Rolle überein

**Auto-Submit:** In `renderCase()` → `maybeAutoSubmitQueuedVote()`:
- Wenn lokale Rolle jetzt am Zug ist (`state.selectedRole.id === queuedVote.roleId`)
- Kein ausstehender Vote-Request
- Option noch verfügbar
→ `submitMultiplayerVote(option, 'queued')` wird aufgerufen, `renderCase()` gibt `true` zurück

**Verwurf:** Bei Stichwahl wird `queuedMultiplayerVote = null` gesetzt (Option möglicherweise nicht mehr verfügbar)

---

## Deduplizierung von Relay-Events

`RelayMultiplayerRuntime` hält `seenEventIds: Set<string>`.  
Event-ID = `event.messageId ?? \`${event.actorPubkey}:${event.seq}\``

Da Relay-Nachrichten mehrfach zugestellt werden können (Relay-Reconnect, getrennte Subscriptions), ist dies kritisch für die Korrektheit.

---

## getMergedSnapshot() – Herzstück der Host-Authorität

Diese Methode in `HostAuthority` ist die einzige Wahrheitsquelle für den Raum-Zustand:

```
1. Hole getAuthoritativeSnapshot() → lokaler Host-GameState als Basis
2. Bestimme currentRoundId = round-${state.currentCase}
3. Bestimme phaseKey = getVotePhaseKey(state)
4. Merge authoritative roundVotes (überschreibe state.roundVotes komplett)
5. Merge akzeptierte Linsen-Auswahl
6. Merge Pakt-Submissions und Pakt-Votes
7. Berechne deriveResolvedPakt() → state.pakt und paktWinnersByArticle
8. Wenn Stimmen vorhanden und nicht alle abgestimmt:
   a. Finde letzten akzeptierten Vote (höchster seq)
   b. Baue nextRoleSourceState mit selectedRole und currentRoleIndex dieses Votes
   c. getNextPendingRole(nextRoleSourceState) → nächste freie Rolle
   d. Überschreibe state.selectedRole und state.currentRoleIndex
9. Füge roleOwners aus acceptedRoleOwners hinzu
10. Setze pendingRoundClose wenn vorhanden
```

**Warum Schritt 8 wichtig ist:** Ohne diese Ankerung könnte `currentRoleIndex` in der Snapshot-Basis driften (weil Clients State-Sync-Events in unterschiedlicher Reihenfolge verarbeiten). Der Fix stellt sicher, dass der nächste Zug immer vom letzten tatsächlich akzeptierten Vote aus berechnet wird.

---

## Session-Identität und Schlüssel-Management

**Kein persistenter privater Schlüssel:**  
Jede Browsersitzung generiert ephemere Schlüssel. Nach Browser-Tab-Schließen sind sie weg.

**Session-Wiederverwendung:**  
Bei Reload oder Vor-/Zurück-Navigation wird die Session aus `sessionStorage` wiederhergestellt. Schlüssel-Format: `genesis:transport-session:{mode}:{gameId}:{relayUrl}`.

**Frische Navigation:**  
Beim direkten Aufrufen der URL oder Klick auf einen Link werden neue Schlüssel generiert → neue `playerId`. Dies verhindert Ghost-Clients aus alten Sessions.

**Im Code:**
```typescript
shouldReusePersistedSession()
  → performance.getEntriesByType('navigation')[0].type
  → 'reload' oder 'back_forward': session wiederverwenden
  → sonst: neue Session
```

---

## URL-Parameter für Multiplayer

| Parameter | Werte | Bedeutung |
|---|---|---|
| `?mp=host` | host | Host-Browser, HostAuthority aktiv |
| `?mp=join` | join | Client-Browser |
| `?game=genesis-XXXXXX` | Room-Code | Nostr-Subscription-Filter |
| `?relay=ws://...` | URL | Relay-Server-Adresse |

Beispiel-URL für Host: `http://localhost:4173/?mp=host&game=genesis-5c8e7a&relay=ws://localhost:7000/`  
Beispiel-URL für Client: `http://localhost:4173/?mp=join&game=genesis-5c8e7a&relay=ws://localhost:7000/`

Die Invite-URL wird automatisch generiert und in der UI als kopierbares Feld angezeigt.

---

## URL-Parameter für Gameplay-Timing

| Parameter | Beispiel | Bedeutung |
|---|---|---|
| `?timing=kurz` | kurz/standard/lang | Timer-Preset |
| `?decisionTimerSeconds=60` | Zahl | Überschreibt Timer-Preset |
| `?lensBonus=8` | Zahl | Linsen-Bonus-Sekunden |

Defaults: `decisionTimerSeconds = 90`, `lensSelectionBonusSeconds = 12`
