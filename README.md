# Projekt Genesis

Ein rundenbasiertes Planspiel zu KI, Verantwortung, Theologie und demokratischer Entscheidungsfindung. Spieler:innen oder Gruppen übernehmen Ratsmitglieder in der fiktiven Stadt **Neopolis** und entscheiden gemeinsam, wie KI-Systeme eingesetzt, kontrolliert oder abgeschaltet werden.

---

## Das Spiel

Neopolis wird von drei KI-Systemen mitregiert: **SOPHIA** (Bildung), **AEGIS** (Gesundheit), **PAX** (Sicherheit). Der Rat für KI, Mensch und Verantwortung muss in 7 echten Entscheidungssituationen handeln – ethisch belastet, politisch umkämpft, unter Zeitdruck.

Jede Runde:

1. Der Rat liest einen Fall und wählt je eine Deutungslinse
2. Alle Ratsmitglieder stimmen nacheinander ab
3. Erst nach der letzten Stimme wird ausgewertet – die Stadtbilanz verändert sich
4. Systemische Folgewirkungen können weitere Werte kippen
5. Am Ende formuliert der Rat seinen **Genesis-Pakt**: fünf ethische Artikel als gemeinsame Selbstverpflichtung

### Die sieben Fälle

| # | System | Fall |
|---|---|---|
| 1 | SOPHIA | Der perfekte Lernplan |
| 2 | AEGIS | Die übersehene Diagnose |
| 3 | SOPHIA | Die motivierten Schüler:innen |
| 4 | PAX | Risikoprofile für Jugendliche |
| 5 | AEGIS | Der soziale Wert eines Lebens |
| 6 | PAX | Die autonome Kill-Chain |
| 7 | PAX | Das smarte Energie- und Wärmenetz |

### Die sechs Rollen

| Rolle | Perspektive |
|---|---|
| ✝️ Theolog:in / Religionspädagog:in | Menschenbild, Berufung, Schöpfungsverantwortung |
| 💻 KI-Entwickler:in | Technik, Daten, Machbarkeit, Systemrisiken |
| ⚖️ Jurist:in / Politiker:in | Rechte, Haftung, Regulierung, Gemeinwohl |
| 🤝 Sozialarbeiter:in / Pädagog:in | Betroffene, Bildung, soziale Ungleichheit, Diskriminierung |
| 🗣️ Bürger:innenvertretung / Jugendstimme | Alltagserfahrungen, Zusammenhalt, Freiheit, Zukunft |
| 🔥 Prophetische Stimme | Kritik an Macht, Schutz der Schwachen, Zukunftswarnung |

Jede Rolle hat eine einmalige Sonderfähigkeit, die strategisch eingesetzt werden kann.

### Die Stadtbilanz

Fünf Werte (Skala –5 bis +5) und algorithmische Macht (0–10):

| Wert | Bedeutung |
|---|---|
| Nutzen | Bildung, Gesundheit, Sicherheit funktionieren |
| Gerechtigkeit | Faire Chancen- und Risikoverteilung |
| Frieden | Sozialer Zusammenhalt |
| Schöpfung | Ökologische und infrastrukturelle Tragbarkeit |
| Autonomie | Menschliche Handlungsfähigkeit |
| ⚡ Macht | Algorithmische Kontrolle (ab 8: kritisch) |

Systemische Folgewirkungen koppeln die Werte aneinander: Ein kollabierender Nutzen zieht langfristig den Frieden mit.

### Die neun Enden

| Ende | Bedingung (vereinfacht) |
|---|---|
| 👁️ PAX DOMINUS | Macht ≥ 10 oder Autonomie ≤ –5 |
| 🧨 Versorgungskollaps | Nutzen ≤ –4 oder Schöpfung ≤ –4 |
| 🏚️ Soziale Unruhen | Frieden ≤ –4 |
| ⚔️ Kampf um Ressourcen | Gerechtigkeit ≤ –4 |
| 🌪️ Klimakostenexplosion | Schöpfung ≤ –3 und Nutzen ≤ –1 |
| 🌟 Der verantwortete Genesis-Pakt | Macht ≤ 4, Gerechtigkeit/Frieden/Autonomie/Schöpfung ≥ 1 |
| 🏙️ Technokratischer Frieden | Nutzen gut, aber Gerechtigkeit/Autonomie schlecht oder Macht hoch |
| ⚖️ Regulierte Hybridität | Macht 4–8, alle anderen Werte ≥ 0 |
| 🌀 Komplexe Wirklichkeit | Fallback |

---

## Spielmodi

### Singleplayer

Eine Person übernimmt alle Ratsmitglieder nacheinander. Gut für didaktische Einzelarbeit oder Testläufe.

**Start:** Mindestens zwei Rollen wählen → `?mode=singleplayer` oder Standardauswahl im Startscreen.

---

### Mehrere Personen am selben Gerät (Single-Device-Multiplayer)

Mehrere Gruppen sitzen gemeinsam vor einem Browser. Das Gerät wird nach jeder Stimmabgabe weitergegeben. Die UI zeigt immer, welche Rolle gerade abstimmt.

**Start:** Rollen verteilen → Spiel starten. Stimmen bleiben bis zur Rundenauswertung verdeckt.

---

### Online-Multiplayer via Nostr-Relay

Jede Person oder Gruppe spielt auf ihrem eigenen Browser. Stimmen werden über ein Nostr-Relay synchronisiert. Der Host validiert alle Aktionen autoritativ.

**Voraussetzung:** Ein laufendes Nostr-Relay (lokal oder öffentlich).

#### Lokales Relay starten (Entwicklung)

```bash
# Mit jedem Nostr-kompatiblen Relay, z.B. strfry oder nostream
# Default-Adresse: ws://localhost:7000/
```

#### Spiel hosten

```
http://localhost:4173/?mp=host&relay=ws://localhost:7000/
```

Der Startscreen zeigt einen kopierbaren Einladungslink für alle anderen Spieler:innen.

#### Spiel beitreten

Den Einladungslink öffnen – oder manuell:

```
http://localhost:4173/?mp=join&game=genesis-XXXXXX&relay=ws://localhost:7000/
```

#### Empfohlene Spieleranzahl

Mindestens 2, bis zu 6 Rollen. 3-Spieler-Betrieb ist getestet und bestätigt.

---

## Konfiguration

### Zentrale Konfigurationsdatei

```
src/config.ts
```

Alle spielrelevanten Einstellungen an einem Ort:

```typescript
// Standard-Relay-Adressen (kommasepariert im Eingabefeld, Array in der Konfig)
export const MULTIPLAYER_DEFAULTS = {
  relayUrls: ['wss://relay.primal.net'],
  roomCodePrefix: 'genesis',
};

// Multiplayer-Timing (Millisekunden)
export const MULTIPLAYER_TUNING = {
  initialStateSyncDelayMs: 80,    // Wartezeit vor erstem Sync-Request (Client)
  recoveryTimeoutMs: 900,         // Timeout bis Recovery-Sync ausgelöst wird
  publishRetryAttempts: 4,        // Versuche bei Relay-Publish-Fehler
  publishRetryDelayMs: 80,        // Pause zwischen Publish-Versuchen
  subscriptionRetryDelayMs: 150,  // Pause bei Subscription-Wiedereintritt
  followupStateSyncEnabled: true, // Automatischer Snapshot nach jeder Aktion
  followupStateSyncDelayMs: 45,   // Verzögerung dieses Snapshots
};
```

### Gameplay-Timer

```
src/game/config.ts
```

```typescript
export const GAMEPLAY_TIMING = {
  decisionTimerSeconds: 90,        // Standard-Beratungszeit pro Runde
  lensSelectionBonusSeconds: 12,   // Bonus-Sekunden durch Linsenauswahl
};
```

**Timer-Presets per URL:**

| Parameter | Effekt |
|---|---|
| `?timing=kurz` | 60 s, 8 s Linsenbonus |
| `?timing=standard` | 90 s, 12 s Linsenbonus |
| `?timing=lang` | 120 s, 15 s Linsenbonus |

Einzelwerte überschreiben:
```
?decisionTimerSeconds=45&lensBonus=5
```

---

## Entwicklung

### Voraussetzungen

- Node.js ≥ 18
- npm

### Setup

```bash
npm install
```

### Starten

```bash
npm run dev
```

Öffnet den Dev-Server unter `http://localhost:4173/`.

### Tests

```bash
npx vitest run      # Einmalig (65 Tests)
npx vitest          # Watch-Modus
```

### Build

```bash
npm run build       # TypeScript-Kompilierung + Vite-Bundle
```

---

## Debug-Modus

Hilfreiche URL-Parameter für Entwicklung und Fehlersuche:

| Parameter | Effekt |
|---|---|
| `?dev` | Rohe Zahlenwerte statt Labels, DEV-Badge im Status |
| `?debug=1` | Multiplayer-Event-Log (nur im Online-Modus sichtbar) |

Vollständige Dokumentation der Debugging-Werkzeuge: [`docs/debugging.md`](docs/debugging.md)

---

## Projektstruktur

```
src/
  config.ts          ← Zentrale Konfiguration (Relay, Timing)
  main.ts            ← UI-Orchestrator
  game/
    data/            ← Spielinhalte (Fälle, Rollen, Linsen, Enden, Texte)
    engine/          ← Pure Spiellogik (Voting, Runden, Pakt)
    rules/           ← Sonderfähigkeiten
  transport/         ← Multiplayer-Transport (Nostr, Session, HostAuthority)
docs/                ← Technische Spezifikationen
tests/               ← 65 automatisierte Tests (Vitest)
```

Technische Dokumentation:

| Dokument | Inhalt |
|---|---|
| [`docs/game-flow.md`](docs/game-flow.md) | Vollständiger Spielfluss |
| [`docs/state-model.md`](docs/state-model.md) | GameState-Modell, Werteskalen |
| [`docs/multiplayer-transport.md`](docs/multiplayer-transport.md) | Transport-Events, Validierungsregeln |
| [`docs/debugging.md`](docs/debugging.md) | Breakpoints, Fehlerszenarien |
| [`docs/tasks_0001.md`](docs/tasks_0001.md) | Offene Aufgaben |

---

## Sicherheitshinweise

- Keine dauerhaften Nostr-Schlüssel – das Spiel verwendet ausschließlich ephemere Sitzungsschlüssel
- Keine personenbezogenen Daten erforderlich
- Eingehende Relay-Events werden host-autoritativ validiert (phaseKey, Rollenbesitz, Seq)
- `?debug=1` nur in der Entwicklung verwenden – das Panel nutzt `innerHTML`
