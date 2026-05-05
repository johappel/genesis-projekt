# tasks_0000.md - Genesis Projekt Initialplanung

Statuslegende:

- `[ ]` offen
- `[~]` in Arbeit
- `[x]` erledigt
- `[!]` blockiert oder klaerungsbeduerftig

Arbeitsregel fuer alle Tasks:

- Vor Start `AGENTS.md` lesen.
- Keine privaten Keys, echten `nsec`-Werte oder Relay-Secrets erzeugen oder speichern.
- Fakten, Balancing-Werte und Spieltexte getrennt halten.
- Kleine, pruefbare Aenderungen bevorzugen.
- Wenn eine Entscheidung offen ist, Annahme dokumentieren und klein weiterarbeiten.

## Phase 0 - Projektbasis sichern

### T0001 - Repository-Zustand pruefen

Ziel: Sicherstellen, dass im neuen Projektverzeichnis sauber weitergearbeitet werden kann.

Eingaben:

- `F:\code\games\genesis-projekt`
- `AGENTS.md`

Schritte:

- Pruefe, ob das Verzeichnis bereits ein Git-Repository ist.
- Pruefe, welche Dateien im Verzeichnis liegen.
- Dokumentiere kurz, ob `Spiel-A.html` als Quellkopie vorhanden ist.

Ergebnis:

- Kurze Notiz in `docs/project-notes.md` oder im Task-Kommentar.

Akzeptanzkriterien:

- Es ist klar, ob Git initialisiert werden muss.
- Keine vorhandene Datei wurde geloescht oder ueberschrieben.

### T0002 - Tech-Stack festlegen

Ziel: Minimalen Stack fuer den ersten Prototyp festlegen.

Empfohlene Annahme:

- Vite
- TypeScript
- React nur wenn UI-Komplexitaet es rechtfertigt
- Vitest fuer Engine-Tests

Schritte:

- Entscheide, ob der erste Prototyp mit Vanilla TypeScript oder React gebaut wird.
- Begruende die Wahl in `docs/architecture.md`.
- Halte fest, dass Multiplayer erst nach stabiler Single-Device-Engine kommt.

Akzeptanzkriterien:

- `docs/architecture.md` enthaelt Stack-Entscheidung und Begruendung.
- Die Entscheidung widerspricht nicht `AGENTS.md`.

### T0003 - Projekt scaffolden

Ziel: Aus dem leeren Verzeichnis ein lauffaehiges Webprojekt machen.

Schritte:

- Projekt mit dem in T0002 gewaehlten Stack anlegen.
- `src/` und `tests/` vorbereiten.
- Scripts fuer `dev`, `test`, `build` anlegen.

Akzeptanzkriterien:

- `npm run dev` startet lokal.
- `npm run test` laeuft ohne Fehler.
- `npm run build` laeuft ohne Fehler.

## Phase 1 - Datenmodell und getrennte Datenpflege

### T0101 - Datenarten definieren

Ziel: Festlegen, welche Daten getrennt gepflegt werden.

Zu trennen:

- Rollen
- Faelle
- Entscheidungsoptionen
- Balancing-Effekte
- Linsen und Analysehinweise
- Enden
- Fakten und Quellenhinweise
- UI-Texte

Schritte:

- Erstelle `docs/data-model.md`.
- Beschreibe jede Datenart mit Zweck und Beispiel.
- Markiere, welche Daten balancerelevant sind.

Akzeptanzkriterien:

- `docs/data-model.md` erklaert die Trennung klar.
- Balancing-Werte sind nicht mit langen Erzaehltexten vermischt.

### T0102 - Zielstruktur fuer Datendateien anlegen

Ziel: Eine klare Struktur fuer pflegbare Spielinhalte schaffen.

Dateien anlegen:

- `src/game/data/roles.ts`
- `src/game/data/lenses.ts`
- `src/game/data/cases.ts`
- `src/game/data/endings.ts`
- `src/game/data/facts.ts`
- `src/game/data/uiText.ts`
- `src/game/data/balance.ts`

Schritte:

- Leere oder minimale exports anlegen.
- Typen noch nicht gross implementieren, nur stabile Dateigrenzen schaffen.

Akzeptanzkriterien:

- Jede Datei exportiert mindestens eine benannte Konstante.
- Keine Datei enthaelt private Daten oder Netzwerkkonfiguration.

### T0103 - TypeScript-Typen fuer Spieldaten definieren

Ziel: Daten so typisieren, dass Pflegefehler frueh sichtbar werden.

Dateien:

- `src/game/types.ts`

Typen definieren:

- `Role`
- `Lens`
- `Case`
- `DecisionOption`
- `BalanceEffect`
- `Ending`
- `FactNote`
- `GameValueKey`

Akzeptanzkriterien:

- Alle Datendateien koennen die Typen importieren.
- `BalanceEffect` erlaubt nur bekannte Werteschluessel.
- Faktenhinweise sind optional, aber strukturiert.

### T0104 - Rollen aus Spiel-A extrahieren

Ziel: Rollen separat pflegbar machen.

Quelle:

- `Spiel-A.html`, Abschnitt `ROLES`

Zieldatei:

- `src/game/data/roles.ts`

Schritte:

- Rollen-IDs, Namen, Perspektiven, Beschreibungen und Sonderfaehigkeiten uebertragen.
- Keine UI-HTML-Fragmente uebernehmen.
- Sonderfaehigkeiten als Daten beschreiben, nicht direkt als Logik.

Akzeptanzkriterien:

- Alle Ratsmitglieder aus Spiel A sind vorhanden.
- Jede Rolle hat eine eindeutige `id`.
- Keine doppelte Rolle kann durch Datenfehler entstehen.

### T0105 - Linsen aus Spiel-A extrahieren

Ziel: Analyse-Linsen separat pflegbar machen.

Quelle:

- `Spiel-A.html`, Abschnitt `LINSEN`

Zieldatei:

- `src/game/data/lenses.ts`

Akzeptanzkriterien:

- Alle Linsen aus Spiel A sind vorhanden.
- Jede Linse hat `id`, `name`, `leitfrage` und kurze Beschreibung.
- Keine Fall-spezifischen Effekte in dieser Datei speichern.

### T0106 - Balancing-Schluessel zentralisieren

Ziel: Werte und Skalen zentral pflegbar machen.

Zieldatei:

- `src/game/data/balance.ts`

Inhalte:

- Startwerte
- Min-/Max-Werte
- Wertelabels
- Schwellwerte fuer Krisen und Enden
- Default-Regel fuer Gleichstand

Akzeptanzkriterien:

- Engine nutzt spaeter keine hart codierten Skalen.
- Balancing-Datei enthaelt keine langen Storytexte.

### T0107 - Faelle in Inhalt und Balancing trennen

Ziel: Faelle aus Spiel A so extrahieren, dass Fakten und Balancing gut nachpflegbar sind.

Zieldateien:

- `src/game/data/cases.ts`
- `src/game/data/facts.ts`
- `src/game/data/balance.ts`

Schritte:

- Pro Fall Storydaten in `cases.ts` speichern.
- Entscheidungsoptionen mit stabilen IDs versehen.
- Zahlenwerte und Effekte als `BalanceEffect` strukturieren.
- Faktische Aussagen mit `factNoteIds` markieren, wenn sie belegbar oder pruefbeduerftig sind.

Akzeptanzkriterien:

- Jede Entscheidung hat eine stabile `id`.
- Jede Entscheidung hat getrennte Felder fuer Text, Konsequenz, Reflexion und Effekte.
- Keine Quelle wird erfunden.
- Unbelegte reale Behauptungen werden in `facts.ts` als `needsSource: true` markiert.

### T0108 - Fakten- und Quellenmodell vorbereiten

Ziel: Wissenschaftliche und reputationssensible Aussagen nachpflegbar machen.

Zieldatei:

- `src/game/data/facts.ts`

Felder pro Eintrag:

- `id`
- `claim`
- `status`: `fictional`, `needs-source`, `sourced`
- `sourceLabel`
- `sourceUrl`
- `notes`

Akzeptanzkriterien:

- Narrative Spielannahmen koennen als `fictional` markiert werden.
- Reale Aussagen ohne Quelle sind sichtbar als `needs-source`.
- Keine unsichere Behauptung wird als belegt markiert.

## Phase 2 - Reine Single-Device-Engine

### T0201 - Initialen Spielzustand modellieren

Ziel: Serialisierbaren Spielzustand ohne DOM-Abhaengigkeit bauen.

Dateien:

- `src/game/state.ts`
- `src/game/engine/createGame.ts`

Akzeptanzkriterien:

- `createGame()` erzeugt einen vollstaendigen Startzustand.
- Zustand enthaelt aktive Rollen, aktuelle Runde, Stimmen, Werte und Protokoll.
- Zustand kann mit `JSON.stringify` serialisiert werden.

### T0202 - Rollenvergabe implementieren

Ziel: Jede Rolle darf pro Partie nur einmal vergeben werden.

Datei:

- `src/game/engine/roles.ts`

Regeln:

- Rolle kann nur gewaehlt werden, wenn sie noch frei ist.
- Rollen-ID muss bekannt sein.
- Aktive Spieler:innen koennen Gruppen repraesentieren.

Akzeptanzkriterien:

- Doppelte Rollenwahl wird abgelehnt.
- Unbekannte Rollen-ID wird abgelehnt.
- Tests decken Erfolg und Fehlerfaelle ab.

### T0203 - Voting ohne Sofortwertung implementieren

Ziel: Stimmen sammeln, ohne Werte sofort zu veraendern.

Datei:

- `src/game/engine/voting.ts`

Regeln:

- Jede aktive Rolle hat eine Stimme pro Fall.
- Eine Rolle kann pro Fall nur einmal abstimmen.
- Entscheidungseffekte werden erst bei Rundenauswertung angewendet.

Akzeptanzkriterien:

- Nach einer Stimme bleiben Bilanzwerte unveraendert.
- Doppelabstimmung wird abgelehnt.
- Unbekannte Entscheidungsoption wird abgelehnt.

### T0204 - Rundenabschluss implementieren

Ziel: Bilanzwertung erst anwenden, wenn alle aktiven Rollen abgestimmt haben.

Datei:

- `src/game/engine/rounds.ts`

Schritte:

- Pruefen, ob alle Stimmen vorliegen.
- Gruppenentscheidung bestimmen.
- Balancing-Effekte anwenden.
- Protokolleintrag erzeugen.
- Naechsten Fall vorbereiten oder Finale markieren.

Akzeptanzkriterien:

- Vor vollstaendiger Abstimmung ist Abschluss nicht moeglich.
- Nach Abschluss sind Werte genau einmal veraendert.
- Rundenergebnis ist deterministisch.

### T0205 - Gleichstand und Enthaltung klaeren

Ziel: Offene Entscheidungsregel explizit machen.

Empfohlene Default-Regel fuer Prototyp:

- Keine Enthaltung in Version 1.
- Bei Gleichstand entscheidet eine Stichwahl zwischen den fuehrenden Optionen.

Schritte:

- Regel in `docs/game-rules.md` dokumentieren.
- Engine-Status fuer `needsTieBreak` vorbereiten.

Akzeptanzkriterien:

- Gleichstand fuehrt nicht zu zufaelliger Entscheidung.
- UI kann spaeter anzeigen, dass eine Stichwahl noetig ist.

### T0206 - Sonderfaehigkeiten als getrennte Regeln vorbereiten

Ziel: Sonderfaehigkeiten nicht in UI oder Voting-Funktion vermischen.

Datei:

- `src/game/rules/abilities.ts`

Schritte:

- Fuer jede Rolle definieren, wann die Faehigkeit aktiviert werden darf.
- Noch nicht jede Faehigkeit voll implementieren, aber stabile Schnittstelle schaffen.

Akzeptanzkriterien:

- Engine kann pruefen, ob eine Faehigkeit verfuegbar ist.
- Nutzung wird im Zustand protokolliert.
- Keine Sonderfaehigkeit mutiert UI-Zustand.

## Phase 3 - Tests

### T0301 - Testsetup einrichten

Ziel: Engine-Regeln automatisiert pruefen.

Schritte:

- Vitest konfigurieren.
- Beispieltest fuer `createGame()` schreiben.

Akzeptanzkriterien:

- `npm run test` laeuft.
- Mindestens ein Test prueft initiale Werte.

### T0302 - Rollen-Tests schreiben

Ziel: Rollenvergabe absichern.

Tests:

- bekannte Rolle waehlen
- gleiche Rolle zweimal waehlen
- unbekannte Rolle waehlen

Akzeptanzkriterien:

- Alle Tests sind deterministisch.
- Fehlermeldungen sind fuer UI nutzbar.

### T0303 - Voting-Tests schreiben

Ziel: Abstimmungslogik absichern.

Tests:

- Stimme wird gespeichert
- Werte bleiben vor Rundenabschluss gleich
- Doppelstimme wird abgelehnt
- unbekannte Option wird abgelehnt

Akzeptanzkriterien:

- Voting-Tests decken mindestens zwei Rollen ab.

### T0304 - Rundenabschluss-Tests schreiben

Ziel: Bilanzwertung pruefen.

Tests:

- Abschluss blockiert, solange Stimmen fehlen
- Abschluss funktioniert bei vollstaendigen Stimmen
- Effekte werden genau einmal angewendet
- Gleichstand erzeugt Stichwahlstatus

Akzeptanzkriterien:

- Tests schuetzen vor Sofortwertung nach Einzelstimme.

## Phase 4 - Single-Device-UI

### T0401 - Basislayout bauen

Ziel: Spiel ohne Multiplayer lokal spielbar machen.

Screens:

- Start
- Rollenvergabe
- Fallansicht
- Abstimmungsuebergabe
- Rundenauswertung
- Finale

Akzeptanzkriterien:

- UI liest Daten aus `src/game/data`.
- UI ruft Engine-Funktionen auf.
- Keine Bilanzlogik in UI-Komponenten.

### T0402 - Rollenvergabe-UI bauen

Ziel: Einmalige Rollenwahl sichtbar und verstaendlich machen.

Akzeptanzkriterien:

- Vergebene Rollen sind gesperrt.
- Aktive Spieler:innen/Gruppen sind sichtbar.
- Spielstart ist erst moeglich, wenn mindestens zwei Rollen aktiv sind.

### T0403 - Nacheinander-Abstimmung bauen

Ziel: Single-Device-Flow fuer mehrere Gruppen am selben Geraet.

Akzeptanzkriterien:

- UI zeigt, welche Rolle gerade abstimmt.
- Nach Stimmabgabe wird nicht sofort ausgewertet.
- Naechste Rolle bekommt eine klare Uebergabeansicht.
- Bereits abgegebene Stimmen koennen optional verdeckt bleiben.

### T0404 - Rundenauswertung anzeigen

Ziel: Gemeinsame Entscheidung und Bilanz erst am Rundenende zeigen.

Akzeptanzkriterien:

- Auswertung erscheint erst nach letzter Stimme.
- Gruppenentscheidung wird erklaert.
- Werteveraenderungen und Reflexionsfrage werden angezeigt.
- Protokoll enthaelt alle abgeschlossenen Runden.

## Phase 5 - Pflege, Quellen und Balancing

### T0501 - Balancing-Editor als Entwicklerdatei vorbereiten

Ziel: Werte spaeter einfach nachpflegen koennen.

Minimalziel:

- Kein UI-Editor.
- Klare Datenstruktur und Dokumentation reichen.

Schritte:

- In `docs/balancing.md` erklaeren, wie Effekte geaendert werden.
- Beispiel fuer eine Entscheidung mit Effektwerten zeigen.

Akzeptanzkriterien:

- Eine Person kann Balancing aendern, ohne Engine-Code anzufassen.

### T0502 - Faktenreview-Liste erzeugen

Ziel: Pruefbeduerftige Aussagen sichtbar machen.

Schritte:

- Alle `facts.ts` Eintraege mit `needs-source` in `docs/fact-review.md` auflisten.
- Narrative Aussagen klar als fiktiv markieren.

Akzeptanzkriterien:

- Reale Zahlen oder Studienbehauptungen sind nicht unmarkiert.
- Reputationssensible Themen sind sichtbar.

### T0503 - Inhaltliche Quellen nachtragen

Ziel: Belegbare Aussagen mit Quellen versehen.

Regel:

- Nur serioese Primaerquellen oder wissenschaftlich belastbare Quellen nutzen.
- Bei aktuellen Gesetzen, KI-Regulierung oder Standards live pruefen, nicht aus Erinnerung arbeiten.

Akzeptanzkriterien:

- `facts.ts` unterscheidet sauber zwischen `fictional`, `needs-source` und `sourced`.
- Keine Quelle belegt etwas anderes als der Claim behauptet.

## Phase 6 - Multiplayer-Vorbereitung

### T0601 - Transport-Schnittstelle definieren

Ziel: Multiplayer vorbereiten, ohne Nostr direkt einzubauen.

Datei:

- `src/transport/types.ts`

Events:

- `game-created`
- `role-claimed`
- `vote-cast`
- `round-closed`
- `player-left`
- `state-sync-requested`
- `state-sync-sent`

Akzeptanzkriterien:

- Events sind typisiert.
- Events enthalten `gameId`, `roundId`, `playerId`, `seq`.
- Keine Transportlogik in der Engine.

### T0602 - Lokalen Mock-Transport bauen

Ziel: Multiplayer-Flow ohne Netzwerk testen.

Datei:

- `src/transport/localBus.ts`

Akzeptanzkriterien:

- Mehrere lokale Clients koennen Events austauschen.
- Validierung verhindert Doppelabstimmungen.
- Tests brauchen kein echtes Relay.

### T0603 - Nostr-Sicherheitsentwurf schreiben

Ziel: Vor Implementierung Risiken klaeren.

Datei:

- `docs/nostr-security.md`

Inhalte:

- Keine dauerhaften privaten Keys.
- Temporaere Sitzungsschluessel.
- Eventvalidierung.
- Replay-Schutz.
- Umgang mit Verbindungsabbruch.
- Keine personenbezogenen Daten.

Akzeptanzkriterien:

- Nostr wird nicht implementiert, bevor dieses Dokument existiert.
- Dokument benennt konkrete Missbrauchs- und Reputationsrisiken.

## Phase 7 - Abnahmepunkte

### T0701 - Erster spielbarer Single-Device-Prototyp

Ziel: Eine komplette Partie lokal spielbar machen.

Akzeptanzkriterien:

- Mindestens drei Rollen koennen vergeben werden.
- Mindestens zwei Faelle koennen gespielt werden.
- Jede Runde wertet erst nach allen Stimmen.
- Finale wird erreicht.
- Tests laufen.

### T0702 - Inhaltliche Pflegeprobe

Ziel: Nachweisen, dass Daten wirklich separat pflegbar sind.

Schritte:

- Einen Balancing-Wert in `balance.ts` oder `cases.ts` aendern.
- Einen Faktstatus in `facts.ts` aendern.
- Einen UI-Text in `uiText.ts` aendern.

Akzeptanzkriterien:

- Keine Engine-Datei muss fuer diese drei Aenderungen angepasst werden.
- Tests laufen weiterhin.

### T0703 - Entscheidung ueber naechste Phase

Ziel: Klaeren, ob Multiplayer begonnen wird.

Kriterien:

- Single-Device-Spiel ist stabil.
- Datenmodell ist pflegbar.
- Faktenreview ist mindestens strukturiert.
- Sicherheitsentwurf fuer Nostr liegt vor.

Moegliche Entscheidungen:

- Multiplayer starten.
- Erst Inhalte und Balancing verbessern.
- Erst UI verbessern.
- Projekt einfrieren oder scope reduzieren.
