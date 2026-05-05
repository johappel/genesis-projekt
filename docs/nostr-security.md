# Nostr-Sicherheitsentwurf fuer Projekt Genesis

## Ziel

Der Multiplayer soll ohne Server funktionieren, aber trotzdem Rollenbesitz, Stimmen und Rundenabschluss sauber validieren koennen.

## Kernmodell

- Die URL enthaelt eine `gameId` als Raumkennung.
- Jede Browser-Sitzung erzeugt beim Join einen eigenen temporaeren Nostr-Schluessel.
- Der private Sitzungsschluessel dient nur zum Signieren der Events dieser einen Sitzung.
- Die `gameId` ist eine Raumkennung, aber kein Signaturschluessel.

## Warum kein geteilter nsec

Ein gemeinsamer `nsec` fuer alle Teilnehmenden vereinfacht das Joinen scheinbar, ist aber fuer dieses Projekt die falsche Konstruktion.

Probleme:

- Alle Clients waeren kryptografisch dieselbe Identitaet.
- Rollenbesitz koennte nicht sauber einer Sitzung zugeordnet werden.
- Jeder koennte `role-claimed`, `vote-cast`, `round-closed` oder `state-sync-sent` fuer alle anderen senden.
- Replay-Schutz und Doppelabstimmungs-Schutz wuerden deutlich schwaecher.
- Ein `nsec` in URL, Verlauf oder Screenshot waere trotz Wegwerfcharakter ein geteilter Schreibschluessel.

Deshalb gilt:

- `gameId` oder optional spaeter ein getrenntes `roomSecret` fuer Raumbezug
- pro Client ein eigener ephemerer Nostr-Key fuer Signaturen
- niemals denselben privaten Nostr-Key zwischen Teilnehmenden teilen

## Rollen der Identifikatoren

### gameId

- oeffentliche oder halb-oeffentliche Raumkennung
- wird in der URL geteilt
- dient zum Filtern der Multiplayer-Events
- ist kein Nachweis fuer Schreibrechte

### playerId

- lokale Sitzungs-ID je Browser-Client
- bleibt stabil fuer die Dauer einer Partie
- wird in jedem Event mitgefuehrt

### actorPubkey

- ephemerer oeffentlicher Nostr-Key des Clients
- wird zur Signaturpruefung genutzt
- ist von `playerId` getrennt, kann aber beim Join verbunden werden

## Autoritaet und Synchronisation

Empfohlenes Minimalmodell:

- Eine Sitzung eroefnet das Spiel und gilt als Host.
- Der Host ist fuer den kanonischen Zustand verantwortlich.
- Andere Clients senden nur validierbare Aktionen.
- Der Host sendet bestaetigte Zustandsereignisse und State-Syncs.

Das reduziert Konflikte bei:

- gleichzeitigen Rollenclaims
- doppelten Stimmen
- Rejoins nach Verbindungsabbruch
- Rundenschluss unter Netzwerklatenz

## Pflichtfelder je Event

Jedes Multiplayer-Event muss mindestens enthalten:

- `gameId`
- `roundId`
- `playerId`
- `seq`
- klaren `eventName`

Fachspezifisch je nach Event zusaetzlich:

- `roleId`
- `caseId`
- `optionId`
- `actorPubkey`

## Validierungsregeln

Eingehende Events duerfen nie blind uebernommen werden.

Mindestens zu pruefen:

- Signatur passt zur mitgesendeten `actorPubkey`
- `gameId` passt zur offenen Partie
- `seq` ist pro `playerId` streng monoton
- `role-claimed` nur fuer noch freie Rolle akzeptieren
- `vote-cast` nur akzeptieren, wenn der sendende `playerId` Besitzer der Rolle ist
- pro Rolle hoechstens eine Stimme pro Runde
- `round-closed` nur von der autoritativen Instanz akzeptieren
- `state-sync-sent` nur von der autoritativen Instanz akzeptieren

## Replay-Schutz

- Letzte akzeptierte `seq` pro `playerId` speichern
- Events mit alter oder doppelter `seq` verwerfen
- `roundId` und `caseId` gegen den lokalen Zustand pruefen
- bereits abgeschlossene Runden nicht erneut schliessen

## Umgang mit Rejoin und Verbindungsabbruch

- Sitzungsschluessel werden nicht dauerhaft gespeichert
- Bei Reload oder Verbindungsabbruch gilt ein Client zunaechst als neue Sitzung
- Wiederbeitritt erfolgt ueber `state-sync-requested`
- Rollen duerfen nur ueber explizite Freigabe oder Timeout-Regel neu vergeben werden

## Speicherung und Datenschutz

- Keine dauerhaften privaten Nostr-Schluessel im Browser speichern
- Keine echten `nsec`-Werte in Git, Logs, Screenshots, Testdaten oder Dokumentation ablegen
- Keine personenbezogenen Daten fuer Beitritt oder Rollenwahl verlangen
- Ephemere Events bevorzugen, aber ihre Nicht-Persistenz nicht als Ersatz fuer Validierung behandeln

## Minimaler Join-Flow

1. Host erzeugt `gameId` und ephemeres Keypair.
2. Host publiziert `game-created`.
3. Joinender Client oeffnet URL mit `gameId` und erzeugt eigenes ephemeres Keypair.
4. Joinender Client abonniert Events mit dieser `gameId`.
5. Joinender Client sendet `state-sync-requested`.
6. Host sendet `state-sync-sent`.
7. Joinender Client beansprucht mit `role-claimed` eine freie Rolle.

## Konsequenz fuer die Implementierung

Die naechsten Schritte sollten deshalb sein:

- `src/transport/types.ts` als gemeinsame Eventbasis nutzen
- lokalen Mock-Bus bauen, bevor Relay-Code geschrieben wird
- Host-autoritative Validierung zuerst lokal testen
- Nostr-Transport erst danach hinter dieselbe Schnittstelle haengen