# AGENTS.md - Genesis Projekt

## Projektauftrag

Dieses Repository entsteht als eigenstaendiges Browserspiel auf Basis von:

`F:\code\claude-code\KI und Theologie\Browserspiele-Genesis-Code\Spiel-A.html`

Ziel ist ein rundenbasiertes kooperatives Spiel zu KI, Verantwortung, Theologie und demokratischer Entscheidungsfindung. Spieler:innen oder Gruppen uebernehmen jeweils ein anderes Ratsmitglied im "Rat fuer KI, Mensch und Verantwortung".

## Kernidee

- Jede Rolle beziehungsweise jedes Ratsmitglied darf pro Partie nur einmal vergeben werden.
- Alle aktiven Ratsmitglieder stimmen pro Fall/Runde ab.
- Die Stadtbilanz wird erst am Ende der Runde berechnet, wenn alle aktiven Ratsmitglieder abgestimmt haben.
- Entscheidungen sollen als gemeinsame Ratsentscheidung sichtbar werden, nicht als Sofortaktion einer Einzelrolle.
- Das Spiel soll zunaechst als Single-Device-Version funktionieren und spaeter um Multiplayer erweitert werden.

## Spielmodi

### Single Device

- Mehrere Spieler:innen sitzen am selben Geraet.
- Rollen werden zu Beginn eindeutig verteilt.
- Pro Runde stimmen die Rollen nacheinander ab.
- Die UI muss klare Uebergaben zwischen Spieler:innen unterstuetzen.
- Optional koennen einzelne Stimmen verdeckt abgegeben werden, bevor die gemeinsame Auswertung erscheint.

### Multiplayer

- Mehrere Browser nehmen an derselben Spielsitzung teil.
- Synchronisation erfolgt perspektivisch ueber einen Messagebus.
- Als moegliche Transportebene ist ein vorhandenes Nostr Relay vorgesehen.
- Multiplayer darf erst implementiert werden, wenn die lokale Engine deterministisch und testbar ist.

## Sicherheits- und Reputationsregeln

- Keine dauerhaften privaten Nostr-Schluessel im Browser speichern.
- Keine realen personenbezogenen Daten fuer Spielbeitritt, Rollenwahl oder Abstimmung verlangen.
- Wenn Nostr genutzt wird, nur temporaere Sitzungsschluessel verwenden.
- Keine echten `nsec`-Werte in Git, Logs, Screenshots, Testdaten oder Dokumentation ablegen.
- Keine geheimen Relay-Zugangsdaten committen.
- Multiplayer-Nachrichten muessen mindestens `gameId`, `roundId`, `roleId`, `playerId`, `seq` und einen klar typisierten Eventnamen enthalten.
- Eingehende Multiplayer-Events duerfen nie blind vertraut werden. Sie muessen gegen aktuellen Spielstatus, Rollenbesitz und Rundennummer validiert werden.
- Replay- und Doppelabstimmungen muessen verhindert werden.
- Bei Inhalten zu autonomen Waffen, Diskriminierung, Triage, Bildung, Ueberwachung und Gesundheitsdaten immer verantwortungsvoll formulieren und reputationssensible Aussagen pruefen.
- Ethische und wissenschaftliche Aussagen sollen nicht als gesicherte Fakten erscheinen, wenn sie eher narrative Spielannahmen sind.

## Architekturleitlinien

Die urspruengliche Einzeldatei soll nicht einfach weiter anwachsen. Neue Arbeit soll in getrennte Module aufgeteilt werden:

- `src/game/data`: Rollen, Faelle, Linsen, Enden, Texte.
- `src/game/engine`: reiner Spielzustand, Rundenlogik, Rollenvergabe, Abstimmungen, Bilanzwertung.
- `src/game/rules`: Auswertungsregeln, Sonderfaehigkeiten, Konsens-/Mehrheitslogik.
- `src/transport`: lokaler Transport, spaeter Nostr-Transport.
- `src/ui`: Komponenten, Screens, Eingabeflows.
- `src/persistence`: lokale Speicherung, Export/Import von Sitzungen.

Die Engine soll moeglichst frameworkunabhaengig bleiben. UI-Code darf keine Bilanzlogik enthalten.

## Empfohlener Entwicklungszuschnitt

1. Neues Projekt scaffolden.
2. Daten aus `Spiel-A.html` strukturiert extrahieren.
3. Reine Game-Engine fuer Single-Device bauen.
4. Rollenvergabe und Rundenvoting implementieren.
5. Bilanzwertung erst nach vollstaendiger Abstimmung anwenden.
6. Tests fuer Rollenvergabe, Voting, Rundenauswertung und Sonderfaehigkeiten schreiben.
7. UI fuer Single-Device fertigstellen.
8. Transport-Interface definieren.
9. Lokalen Mock-Transport bauen.
10. Nostr-Transport nur hinter klarer Validierung und ohne persistente private Keys ergaenzen.

## Spielregeln fuer die erste Version

- Eine Partie besteht aus mehreren Faellen.
- Zu Beginn wird festgelegt, welche Ratsmitglieder aktiv sind.
- Jede aktive Rolle hat genau eine Stimme pro Fall.
- Eine Rolle kann pro Runde nur einmal abstimmen.
- Solange nicht alle aktiven Rollen abgestimmt haben, werden keine Werte veraendert.
- Nach der letzten Stimme wird die Gruppenentscheidung bestimmt.
- Danach werden Konsequenz, Bilanzveraenderung, Reflexionsfrage und Protokoll angezeigt.
- Sonderfaehigkeiten duerfen den Rundenablauf beeinflussen, muessen aber deterministisch im Spielprotokoll nachvollziehbar sein.

## Offene Designentscheidungen

Vor Implementierung klaeren oder als explizite Annahme dokumentieren:

- Wird nach Mehrheit, Konsens, Stichwahl oder moderierter Entscheidung ausgewertet?
- Sind Abstimmungen offen oder verdeckt?
- Darf eine Rolle sich enthalten?
- Was passiert bei Gleichstand?
- Haben Gruppenrollen andere Regeln als Einzelpersonen?
- Koennen Rollen im Multiplayer nach Verbindungsabbruch neu beansprucht werden?
- Soll die Partie ohne Server wiederherstellbar sein?
- Welche Inhalte brauchen Quellenangaben oder didaktische Hinweise?

## Technische Qualitaetskriterien

- Spielzustand serialisierbar halten.
- Engine-Funktionen als pure Funktionen bevorzugen.
- Tests fuer jede Regel schreiben, bevor Multiplayer-Transport ergaenzt wird.
- Keine Logik an DOM-IDs koppeln.
- Keine globalen Mutable-State-Muster aus der alten HTML-Datei uebernehmen.
- Keine unvalidierten HTML-Strings aus Netzwerkdaten rendern.
- UI muss auf Desktop, Tablet und Mobil nutzbar bleiben.
- Texte sollen deutsch, klar und didaktisch belastbar sein.

## Arbeitsstil fuer Agenten

- Bestehende Inhalte aus `Spiel-A.html` respektieren, aber nicht unkritisch kopieren.
- Bei theologischen, ethischen oder wissenschaftlichen Aussagen zwischen Spielnarrativ, Werturteil und belegbarer Tatsache unterscheiden.
- Reputationsrisiken aktiv markieren und konkrete Verbesserungen vorschlagen.
- Unabgeschlossene Tasks sichtbar halten und klaeren, ob sie fortgesetzt, zurueckgestellt oder gestrichen werden sollen.
- Kleine, nachvollziehbare Commits und Aenderungen bevorzugen.
- Vor groesseren Architekturentscheidungen die Annahmen dokumentieren.
