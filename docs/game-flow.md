# Genesis-Projekt – Vollständiger Spielfluss

## Überblick

Das Spiel durchläuft sequenziell mehrere **Screens** und **Phasen**. Jeder Screen hat eine klare Einstiegsroutine und definierte Übergänge in den nächsten. Der Spielzustand (`GameState`) ist zu jedem Zeitpunkt vollständig serialisierbar.

---

## Screen-Abfolge

```
screen-start
  └─► screen-intro
        └─► screen-roles
              └─► screen-game  (wiederholt für alle Fälle)
                    └─► screen-finale      (Pakt-Einreichung)
                          └─► screen-end   (Endergebnis)
```

Notfall-Abzweigungen aus `screen-game`:
- `screen-pax-dominus` – wenn `macht >= 10` oder `autonomie <= -5`
- Beliebiges Emergency-Ending – wenn andere Krisenschwelle während einer Runde unterschritten wird

---

## Phase 1 – Start und Intro

### screen-start
**Einstieg:** Seitenaufruf / `window.onload`  
**Aktionen:**
- URL-Parameter werden gelesen (`readMultiplayerUrlConfig`, `readGameplayTimingConfig`)
- Wenn `?mp=host` oder `?mp=join`: Multiplayer-Session wird vorbereitet
- Spielzustand wird per `createGame()` initialisiert
- `startLocalSession(mode)` → zeigt `screen-intro`

### screen-intro
**Einstieg:** `startLocalSession()` oder nach Game-Reset  
**Aktionen:**
- Spielmodus-Wahl (Singleplayer / Mehrspieler am Gerät / Relay-Mehrspieler)
- Kein Zustandswechsel, nur UI-Modal-Aktivierung für Nostr-Einrichtung

---

## Phase 2 – Rollenvergabe

### screen-roles
**Einstieg:** `showScreen('screen-roles')`  
**Funktion:** `initRolesScreen()`  
**Aktionen:**

#### Lokal (Single Device)
1. Spieler:in klickt Rollenkarte → `selectRole(roleId)`
2. `assignRole(state, roleId)` prüft: Rolle bekannt? Noch frei?
3. Bei `ok: true`: Rolle wird zu `state.activeRoles` hinzugefügt
4. `updateRoleSelectionUI()` zeigt vergebene Rollen gesperrt an
5. Mindestanzahl erreicht → Button "Spiel starten" aktiv
      - Singleplayer: mindestens 1 Rolle
      - Mehrspieler am selben Gerät und Relay-Multiplayer: mindestens 2 Rollen

#### Multiplayer
1. Spieler:in klickt Karte → `runMultiplayerRequest({ kind: 'role-claim', ... })`
2. Event `role-claimed { claimStatus: 'requested' }` wird via Relay gesendet
3. Host-`HostAuthority.handleRoleClaimRequested()` prüft und antwortet mit `claimStatus: 'accepted'|'rejected'`
4. Alle Clients empfangen das resolved Event → `addActiveRoleById(roleId)`
5. Host sendet danach `scheduleFollowupStateSync()` (45 ms Verzögerung)

**Spielstart:**
- Lokal: `startGame()` → initialisiert erste Runde, zeigt `screen-game` mit Übergabe-Overlay
- Host-Multiplayer: `publishOpenedPhase()` → sendet `phase-opened` an alle Clients

---

## Phase 3 – Spielrunden (screen-game)

Jede Runde besteht aus diesen Teilphasen:

```
[Linsen-Phase]  →  [Abstimmungsphase]  →  [Konsequenz-Overlay]  →  [Rundenabschluss]
```

### 3a – Linsen-Phase (optional)
**Steuerung:** `renderLensGrid(caseData)` im `renderScenarioPanel()`  
**Bedingung:** `lensInitiativeRole` ist die Rolle bei `state.activeRoles[state.lensInitiativeIndex]`

- Nur die Initiative-Rolle darf eine Linse wählen
- `selectLens(lensId, caseData)` → lokal: Zustand sofort aktualisiert; Multiplayer: `lens-selected { selectionStatus: 'requested' }` gesendet
- Host prüft: Linse bekannt? Noch nicht gesetzt? Rolle ist Initiator? → `accepted`/`rejected`
- Bei `accepted`: `state.selectedLens` gesetzt, `phaseTimerBonusSeconds` ergänzt, Timer neu gestartet
- `lensInitiativeIndex` wird nach jeder Runde um 1 erhöht (mod `activeRoles.length`)

### 3b – Abstimmungsphase
**Steuerung:** `renderCase()` → `renderScenarioPanel(caseData)`  
**Timer:** `startDecisionTimer(caseData)` – läuft von `decisionTimerSeconds + phaseTimerBonusSeconds` auf 0

#### Lokal – wer ist dran?
`state.selectedRole` zeigt die aktuell abstimmende Rolle.  
`state.currentRoleIndex` ist der Index in `state.activeRoles`.

#### Vormerkungs-System (Multiplayer)
Spieler:innen, deren Rolle **noch nicht** am Zug ist, können lokal vormerken:
- `handleLocalDraftDecision(optionId)` → `queueMultiplayerVote(option)`
- Nur lokal in `queuedMultiplayerVote` gespeichert, **kein** Relay-Event
- Wenn die Rolle an die Reihe kommt und `maybeAutoSubmitQueuedVote()` ausgeführt wird, wird die Stimme automatisch eingereicht

#### Stimme abgeben – Lokal
1. `handleDecision(optionId)` aufgerufen
2. Veto-Prüfung: Wenn `prophetinVetoActive` → `showVetoNotice()`, Runde bleibt offen
3. `castVote(state, caseId, optionId, availableOptionIds)` → gibt neues `state.roundVotes` zurück
4. Wenn nicht alle abgestimmt: `advanceToNextRole(state)` → `showHandoverNotice()`
5. Wenn alle abgestimmt: `determineRoundDecision()` → Konsequenz oder Stichwahl

#### Stimme abgeben – Multiplayer
1. `submitMultiplayerVote(option, 'manual'|'queued')`
2. Setzt `pendingMultiplayerRequest { kind: 'vote' }` + Recovery-Timer (900 ms)
3. Sendet `vote-cast { voteStatus: 'requested' }` via Relay
4. Host-`handleVoteCastRequested()` prüft und antwortet mit `voteStatus: 'accepted'|'rejected'`
5. Alle Clients empfangen resolved Event → `applyAcceptedVote(event)`
6. In `applyAcceptedVote()`: `castVote()` auf lokalem State, dann `advanceToNextRole()` **verankert am akzeptierten RoleIndex**
7. Wenn alle abgestimmt haben: Host ruft `continueHostMultiplayerRoundIfReady()` → sendet `round-closed { roundCloseStatus: 'requested' }`
8. Host Authority akzeptiert `round-closed` → alle empfangen `roundCloseStatus: 'accepted'`

### 3c – Timer-Ablauf
**Lokal:** `autoDecide(caseData)` → wählt `councilPreVoteOptionId` als Fallback  
**Multiplayer (nicht Host):** fordert State-Sync an  
**Multiplayer (Host):** `handleMultiplayerTimeout()` → sendet Timeout-Vote für aktuelle Rolle (`resolveTimedOutVote`)

### 3d – Stichwahl (Tie-Break)
**Auslöser:** `determineRoundDecision()` gibt `status: 'tie-break'` zurück  
**Ablauf:**
1. `beginTieBreak(state, optionIds)` → setzt `state.tieBreakOptions`, erhöht `tieBreakRound`
2. Multiplayer: `publishOpenedPhase()` → `phase-opened` mit Stichwahl-Snapshot
3. Laufende Abstimmung, `getAvailableDecisions()` filtert auf verbleibende Optionen
4. Stichwahl-Phase hat eigenen `phaseKey`: `round-X:tie-break-N`

### 3e – Konsequenz-Overlay
**Auslöser:** `showConsequence(option, voteCount)`  
**Inhalt:**
- Gewählte Entscheidung, Stimmanzahl
- KI-Vorvotum-Abgleich (`councilPreVoteOptionId`)
- Effektvorschau (Tendenzen, im Dev-Mode Rohwerte)
- Button "OK" → `closeConsequence()`

`closeConsequence()`:
1. Wendet Sonderfähigkeiten an (Bürger:in Forecast, Juristin Shield)
2. Ruft `closeRound(state, modifiedEffect, ...)` auf
3. Prüft `getAppliedRoundEffect()`: Macht-Kosten erhöhen automatisch Schöpfungskosten (`-1`)
4. Systemische Folgewirkungen (`applySystemicConsequences()`) können zusätzliche Effekte auslösen
5. Wenn systemische Notes vorhanden: `showSystemicConsequences()` → weiteres Overlay
6. Danach: `advanceAfterRound()` → prüft Emergency-Endings

### 3f – Rundenende und Notfall-Endings
`getEmergencyEndingBadge(state)` wird nach jedem `renderCase()` und `advanceAfterRound()` geprüft:

| Bedingung | Badge | Screen |
|---|---|---|
| `macht >= 10` oder `autonomie <= -5` | `👁️` | `screen-pax-dominus` |
| `nutzen <= -5` | `🧨` | Emergency-Overlay |
| `gerechtigkeit <= -5` | `🏚️` | Emergency-Overlay |
| `frieden <= -5` | `⚔️` | Emergency-Overlay |
| `schoepfung <= -5` | `🌪️` | Emergency-Overlay |

Wenn kein Notfall-Ende: nächster Fall über `showNextRoundPrompt()`  
Wenn alle Fälle gespielt (`state.currentCase >= CASES.length`): → `screen-finale`

---

## Phase 4 – Finale (screen-finale)

**Einstieg:** `showScreen('screen-finale')` → `renderFinaleScreen()`  
**Zustand:** `state.currentCase >= CASES.length`

### 4a – Pakt-Einreichung
Jede Rolle reicht für 5 Artikel einen Textbeitrag ein:

**Lokal:**
1. Eingabefelder werden durch `syncPaktInputsFromState()` befüllt
2. Entwurf wird in `sessionStorage` (Key: `genesis:pakt-draft`) zwischengespeichert
3. "Pakt einreichen" → prüft `isCompletePaktSubmission()` → setzt `state.pakt` direkt

**Multiplayer:**
1. Spieler:in füllt Felder aus → Entwurf in `sessionStorage`
2. "Pakt einreichen" → `runMultiplayerRequest({ kind: 'pakt-submit', ... })`
3. Sendet `pakt-submitted { submitStatus: 'requested' }` via Relay
4. Host prüft: vollständige Antworten? Rolle zugewiesen? Bereits eingereicht?
5. Bei `accepted`: `applyAcceptedPaktSubmission()` → speichert in `state.paktSubmissionsByRole`
6. `scheduleFollowupStateSync()` nach jeder akzeptierten Einreichung

### 4b – Artikelwertung (nur bei ≥ 3 aktiven Rollen)
**Bedingung:** `isPaktScoringRequired(state)` → `activeRoles.length > 2`  
**Auslöser:** `haveAllActiveRolesSubmittedPakt(state)` = true

Jede Rolle bewertet jeden Artikel: 2 Punkte an den besten Fremdbeitrag, 1 Punkt an den zweitbesten.

**Multiplayer:**
1. Zwei `<select>`-Felder für 2P und 1P pro Artikel
2. "Wertung senden" → `submitPaktVote(articleId)`
3. Sendet `pakt-voted { voteStatus: 'requested' }`
4. Host prüft: Pakt ready? Kein Selbstvotum? Keine Duplikat-Ziele? Rolle hat noch nicht gewertet?
5. Bei `accepted`: `applyAcceptedPaktVote()`
6. Wenn alle Artikel vollständig gewertet: `deriveResolvedPakt()` → `state.pakt` und `state.paktWinnersByArticle`

### 4c – Gemeinsamer Pakt-Text und Endergebnis
**Auslöser:** `haveAllActiveRolesCompletedPaktVoting(state)` = true  
**Ausgabe:** `deriveResolvedPakt()` baut `finalPakt` aus Gewinnertext-Beiträgen je Artikel  
**Übergang:** `showScreen('screen-end')` → `renderEndScreen(getCurrentEndingFromState())`

---

## Phase 5 – Endergebnis (screen-end)

**Einstieg:** `renderEndScreen(ending)`  
**Inhalt:**
- Ending-Badge, Titel, Beschreibung, Reflexionsfrage
- Stadtbilanz-Übersicht
- Gemeinsamer Pakt-Text (pro Artikel)
- Button "Neue Partie" → `resetGame()` → `createGame()` → `screen-roles`

---

## Ending-Bestimmung

`getCurrentEndingFromState()` ruft `ENDINGS.find(e => e.condition({ ...state.values, macht: state.macht }))` auf.  
ENDINGS werden in der Reihenfolge geprüft – erste passende Bedingung gewinnt.

| Priorität | Badge | Bedingung |
|---|---|---|
| 1 | 👁️ | macht ≥ 10 **oder** autonomie ≤ -5 |
| 2 | 🧨 | nutzen ≤ -5 |
| 3 | 🏚️ | gerechtigkeit ≤ -5 |
| 4 | ⚔️ | frieden ≤ -5 |
| 5 | 🌪️ | schoepfung ≤ -5 |
| 6 | 🌟 | macht ≤ 4 **und** gerechtigkeit ≥ 2 **und** frieden ≥ 1 **und** autonomie ≥ 1 **und** schoepfung ≥ 1 |
| 7 | 🏙️ | nutzen ≥ 1 **und** (gerechtigkeit ≤ -2 **oder** autonomie ≤ -2 **oder** macht ≥ 7) |
| 8 | ⚖️ | macht 4–8 **und** alle anderen ≥ 0 |
| 9 | 🌀 | immer (Fallback) |

---

## Sonderfähigkeiten

Nur im Lokal-Modus aktiv (Multiplayer noch nicht synchronisiert).

| Rolle | Fähigkeit | Effekt |
|---|---|---|
| Theolog:in | Tiefenfrage | Aktiviert `usedCaseAbilities[roleId+caseId]` – nur einmal pro Fall |
| KI-Entwickler:in | Technische Zusatzinfo | Wie Theolog:in |
| Jurist:in | Rechtsschutz | Einmalig: +1 Gerechtigkeit; nächste Regulierungsoption kostet keinen Friedenspunkt (`juristinShieldActive = true`) |
| Sozialarbeiter:in | Passiv | Betroffene Gruppe immer sichtbar (kein Aktivierungsschritt) |
| Bürger:in | Öffentliche Reaktion | `buergerinForecastActive = true` → Friedenseffekt der nächsten Runde verdoppelt |
| Prophetische Stimme | Veto | `prophetinVetoActive = true` → nächste Entscheidung wird gestoppt, Runde bleibt offen |

Sonderfähigkeiten werden in `abilities` im GameState gespeichert, Effekte in `closeConsequence()` angewendet.

---

## Spielzustände und wann sie kippen

| Zustand | Feld | Auslöser |
|---|---|---|
| Aktive Rollen | `state.activeRoles` | `assignRole()` / `addActiveRoleById()` |
| Aktuelle Rolle | `state.selectedRole` | `advanceToNextRole()` / Host-State-Sync |
| Stimmen dieser Runde | `state.roundVotes` | `castVote()` |
| Stichwahl aktiv | `state.tieBreakOptions` | `beginTieBreak()` |
| Linse aktiv | `state.selectedLens` | `selectLens()` / `applyAcceptedLensSelection()` |
| Timer-Bonus | `state.phaseTimerBonusSeconds` | Linsen-Auswahl |
| Fallindex | `state.currentCase` | `closeRound()` erhöht um 1 |
| Wertebilanz | `state.values` | `applyEffect()` in `closeRound()` |
| Algorithmische Macht | `state.macht` | `applyEffect()` |
| Protokoll | `state.protokoll` | `closeRound()` hängt Eintrag an |
| Pakt-Entwürfe | `state.paktSubmissionsByRole` | `applyAcceptedPaktSubmission()` |
| Pakt-Wertungen | `state.paktArticleVotesByArticle` | `applyAcceptedPaktVote()` |
| Finaler Pakt | `state.pakt` | `deriveResolvedPakt()` |
