# tasks_0001.md – Genesis-Projekt Laufende Aufgaben

Stand: 8. Mai 2026

Statuslegende:

- `[ ]` offen
- `[~]` in Arbeit
- `[x]` erledigt
- `[!]` blockiert oder klärungsbedürftig

Arbeitsregel für alle Tasks:

- Vor Start `AGENTS.md` lesen.
- Keine privaten Keys, echten `nsec`-Werte oder Relay-Secrets erzeugen oder speichern.
- Kleine, prüfbare Änderungen bevorzugen.
- Bei offenen Designentscheidungen: Annahme in `docs/` dokumentieren, dann weitermachen.

---

## Phase A – Pakt-Finale vervollständigen

### TA001 – Pakt-Zustand End-to-End prüfen

Ziel: Sicherstellen, dass der Pakt-Flow vom Finale-Screen bis zum Endscreen vollständig funktioniert.

Kontext:

- Single-Player: `showEnding()` liest DOM-Inputs (`pakt-1`..`pakt-5`) → `state.pakt` → `renderEndScreen()`
- Multiplayer: `renderFinaleScreen()` → Beitragsphase → Bewertungsphase → `state.paktWinnersByArticle` → `state.pakt`
- `deriveResolvedPakt()` wird in `getMergedSnapshot()` automatisch aufgerufen

Zu prüfen:

- [ ] Single-Player: Pakt-Texte erscheinen korrekt im Endscreen (`pakt-display`)
- [ ] Multiplayer (2 Rollen): Bewertungsphase wird korrekt übersprungen (`isPaktScoringRequired()` = false)
- [ ] Multiplayer (3+ Rollen): Bewertungsphase vollständig – `paktWinnersByArticle` befüllt → Endscreen zeigt Gewinnertext
- [ ] Test für `deriveResolvedPakt()` mit vollständigen Wertungen schreiben

Akzeptanzkriterien:

- Endscreen zeigt mindestens einen Artikel-Text für alle Spielmodi.
- Kein leeres `pakt-display` nach vollständigem Spiel.

---

### TA002 – Pakt-Bewertungsphase: UX klären und ggf. verbessern

Ziel: Die Bewertungskarten (`renderPaktVotingCard()`) sind verständlich und nutzbar.

Zu prüfen:

- [ ] Karten zeigen die fremden Beiträge klar an (Rollename + Text)
- [ ] 2-Punkte- und 1-Punkt-Vergabe ist eindeutig bedienbar
- [ ] Bereits abgegebene Wertungen werden visuell bestätigt
- [ ] Auf Mobil nutzbar

---

## Phase B – Bewertungsregeln und Balancing

### TB001 – Systemische Konsequenzen testen

Ziel: Sicherstellen, dass `applySystemicConsequences()` alle Regeln korrekt anwendet.

Kontext:

- Regeln in `src/game/engine/rounds.ts`
- Bisher kein dedizierter Test für Kaskadeneffekte (z.B. `nutzen ≤ -2` → `frieden -1`)

Schritte:

- [ ] Test: `nutzen = -3`, `gerechtigkeit = 0` → `frieden` sinkt um 1
- [ ] Test: `nutzen = -3`, `gerechtigkeit = -2` → `frieden` sinkt um 2
- [ ] Test: `macht > 0` bei Entscheidung → `schoepfung -1` (automatisch via `getAppliedRoundEffect()`)
- [ ] Test: Alle Schwellen in Kombination – keine unerwarteten Mehrfacheffekte

Akzeptanzkriterien:

- Jede Zeile in der Systemik-Tabelle hat einen Test.

---

### TB002 – Balancing-Überprüfung durchführen

Ziel: Sind die 7 Fälle spielbar ohne unlösbare Wertespiralen?

Schritte:

- [ ] Durchspielen aller 7 Fälle mit 3 Rollen und ungünstigsten Optionen – erreicht man trotzdem ein Nicht-PAX-Ende?
- [ ] `macht`-Tracking: Kann `macht` auf 10 steigen, bevor alle Fälle gespielt sind?
- [ ] Min/Max-Werte prüfen: Sind alle `BalanceEffect`-Werte in `cases.ts` innerhalb sinnvoller Grenzen?
- [ ] Dokumentation der Balancing-Annahmen in `docs/balancing.md`

---

## Phase C – Fakten und Inhalte

### TC001 – Faktenreview-Liste erstellen

Ziel: Prüfbedürftige Aussagen in Spieltexten sichtbar machen.

Kontext:

- `src/game/data/facts.ts` existiert, ist aber möglicherweise leer oder minimal
- Spieltexte enthalten reale Behauptungen zu KI-Regulierung, Gesundheits- und Bildungsdaten

Schritte:

- [ ] Alle Einträge in `facts.ts` mit Status `needs-source` in `docs/fact-review.md` auflisten
- [ ] Spieltexte in `cases.ts` auf unbelegte Faktenbehauptungen prüfen
- [ ] Reputationssensible Aussagen markieren (autonome Waffen, Gesundheitsdaten, Diskriminierung)

Akzeptanzkriterien:

- `docs/fact-review.md` listet alle `needs-source`-Einträge.
- Kein `sourced`-Eintrag belegt etwas anderes als der Claim behauptet.

---

### TC002 – uiText.ts auf Vollständigkeit prüfen

Ziel: Alle UI-Texte aus `main.ts` in `uiText.ts` ausgelagert?

- [ ] Prüfen ob noch Inline-Strings in `main.ts` stehen, die in `uiText.ts` gehören
- [ ] Insbesondere: Overlay-Texte, Statusmeldungen, Pakt-Phasentexte

---

## Phase D – Technische Qualität

### TD001 – Build-Warnungen bereinigen

Ziel: `npm run build` ohne Warnungen.

- [ ] `npx tsc --noEmit` ausführen, alle Fehler beheben
- [ ] Vite-Build-Warnungen prüfen (große Bundles, nicht genutzte Exports)

---

### TD002 – Test-Coverage auf Pakt-Engine erweitern

Ziel: `pakt.ts`-Funktionen vollständig getestet.

Zu testen:

- [ ] `haveAllActiveRolesSubmittedPakt()` mit 2 und 3 Rollen
- [ ] `haveAllActiveRolesCompletedPaktVoting()` nach Teilwertungen
- [ ] `deriveResolvedPakt()` – Punktegleichstand (beide Rollen als Gewinner)
- [ ] `isPaktScoringRequired()` – Grenze bei 2 vs. 3 Rollen

---

### TD003 – Multiplayer-Session-Robustheit testen

Ziel: Wiedereintritt nach Verbindungsabbruch verhält sich korrekt.

Schritte:

- [ ] Client schließt Tab und öffnet ihn neu (frische Navigation → neue Session) → kann neue Rolle claimen?
- [ ] Client lädt Seite neu (Reload → Session wiederverwendet) → bestehende Rolle noch aktiv?
- [ ] Host fällt aus während Runde läuft → Clients können nicht weiter abstimmen (kein Recovery ohne Host)

Zu dokumentieren:

- [ ] Verhalten bei Host-Ausfall in `docs/multiplayer-transport.md` ergänzen

---

## Phase E – Erweiterungen (Backlog, noch nicht priorisiert)

### TE001 – Nostr-Transport: Relay-Auswahl in UI

Ziel: Relay-URL soll in der UI konfigurierbar sein, nicht nur über URL-Parameter.

Akzeptanzkriterien:

- Kein Relay-Secret wird gespeichert.
- Temporäre Relay-URL wird in `sessionStorage`, nicht `localStorage` gehalten.

---

### TE002 – Spielstand exportieren / importieren

Ziel: `GameState` als JSON-Datei speichern und laden (für Pausen oder Fehleranalyse).

Kontext: `src/persistence/` ist in `AGENTS.md` vorgesehen, aber noch nicht implementiert.

---

### TE003 – Linsen-UI verbessern

Ziel: Linsen-Auswahl klarer und schneller bedienbar machen.

- [ ] Linsen-Karten zeigen `leitfrage` prominent
- [ ] Bereits verwendete Linsen deutlich als gesperrt dargestellt
- [ ] Timer-Bonus sichtbar kommuniziert

---

### TE004 – Barrierefreiheit prüfen

Ziel: Grundlegende Tastaturnavigation und Screen-Reader-Tauglichkeit.

- [ ] Alle interaktiven Elemente per Tab erreichbar
- [ ] `aria-label` auf Icon-only-Buttons
- [ ] Farbkontrast für Statusfarben prüfen (Stadtbilanz-Werte)
