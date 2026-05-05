import type { Case } from '../types.js';

export const CASES: Case[] = [
  {
    id: 1,
    ki: 'SOPHIA',
    kiIcon: '📚',
    kiColor: '#4caf50',
    title: 'SOPHIA – Der perfekte Lernplan',
    tag: 'nützlich',
    tagClass: 'tag-nuetzlich',
    situation:
      'SOPHIA analysiert seit sechs Monaten das Lernverhalten aller 12.000 Schüler:innen in Neopolis. Das System erstellt für jede:n einen individuellen Lernplan – präzise auf Tempo, Stärken und Schwächen zugeschnitten. Die Ergebnisse sind beeindruckend: Die Durchschnittsnoten steigen um 18%. Besonders leistungsschwächere Schüler:innen profitieren.',
    problem:
      'Bei näherer Analyse fällt auf: Der Lernplan optimiert ausschließlich auf messbare Leistungskennzahlen. Kreativität, Fehlerkultur, soziales Miteinander und persönliche Reifung kommen nicht vor. Lehrkräfte berichten, Schüler:innen würden nur noch auf Prüfungen lernen.',
    question: 'Darf Bildung durch KI primär auf Leistung optimiert werden?',
    reflexionImpuls:
      'Ist Fehlerfreiheit ein gutes Bildungsziel – oder gehört Fehlbarkeit zum Menschsein?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: SOPHIA ist ein effizientes Werkzeug – aber die Bildungsziele hat ein Mensch definiert. Wer hat die Optimierungskriterien festgelegt? Wurde Bildung auf Leistung reduziert, ohne dass eine demokratische Entscheidung getroffen wurde?',
      dialog:
        '💬 Dialog-Linse: Schüler:innen beginnen, SOPHIA wie eine Lehrerin zu behandeln. Manche vertrauen ihr mehr als echten Lehrkräften. Was passiert mit dem Lernverhältnis Mensch–Mensch?',
      aktant:
        '🕸️ Aktant-Linse: SOPHIA verändert das gesamte Bildungsnetzwerk. Lehrkräfte verlieren an Bedeutung. Eltern orientieren sich nur noch an KI-Empfehlungen. Welche Feedback-Schleifen entstehen?',
      macht:
        '⚡ Macht-Linse: SOPHIA normiert, was „gutes Lernen" bedeutet. Schüler:innen werden nach Leistungsprofilen sortiert. Das ist keine neutrale Messung – das ist Macht über Bildungsbiografien.',
      trias:
        '☮️ Trias-Linse: Gerechtigkeit: Profitieren alle Schüler:innen gleich? Frieden: Steigt der Druck auf leistungsschwächere Schüler:innen? Schöpfung: Wie viel Energie verbraucht das System?',
    },
    decisions: [
      {
        id: 'sophia-1-a',
        text: 'SOPHIA voll freigeben und ausbauen',
        icon: '✅',
        effects: { nutzen: 2, frieden: 1, macht: 1, autonomie: -1, schoepfung: -1 },
        consequence:
          'Die Leistungszahlen steigen weiter. Aber Lehrkräfte fühlen sich überflüssig. Erste Schüler:innen werden wegen „Optimierungsprofilen" von Gymnasien ferngehalten. Das Rechenzentrum läuft im Dauerhochbetrieb.',
        reflexion: 'Ist Fehlerfreiheit wirklich ein Bildungsziel? Oder gehört Fehlbarkeit zum Menschsein?',
        iconResult: '📈',
      },
      {
        id: 'sophia-1-b',
        text: 'SOPHIA nur als Assistenz für Lehrkräfte – Letztentscheidung beim Menschen',
        icon: '🤝',
        effects: { nutzen: 1, autonomie: 2, schoepfung: 1 },
        consequence:
          'Lehrkräfte nutzen SOPHIA als Hinweis, entscheiden aber selbst. Das Vertrauen der Schüler:innen bleibt bei den Menschen. Der Fortschritt ist langsamer, aber nachhaltiger. Schulen begrenzen zugleich den permanenten Daten- und Rechenaufwand.',
        reflexion:
          'Was verloren geht, wenn Maschinen über Bildungsbiografien entscheiden – auch wenn sie es besser können?',
        iconResult: '✨',
      },
      {
        id: 'sophia-1-c',
        text: 'Bildungsziele erweitern: Fehlerkultur, Kreativität, Beziehung verpflichtend',
        icon: '🎨',
        effects: { gerechtigkeit: 1, autonomie: 1, frieden: 1, schoepfung: 1 },
        consequence:
          'SOPHIA muss neu trainiert werden. Die Noten sinken kurzfristig. Aber Schüler:innen berichten von mehr Freude am Lernen. Lehrkräfte gewinnen Bedeutung zurück. Weniger Daueroptimierung senkt auch den Infrastrukturverbrauch.',
        reflexion: 'Wer entscheidet, was Bildung bedeutet – der Algorithmus oder die Gemeinschaft?',
        iconResult: '🌱',
      },
      {
        id: 'sophia-1-d',
        text: 'Einsatz stoppen bis ethische Prüfung abgeschlossen',
        icon: '⏸️',
        effects: { nutzen: -1, macht: -1, frieden: -1, schoepfung: 1 },
        consequence:
          'Eltern protestieren, weil ihre Kinder die Vorteile verlieren. Die Prüfung dauert drei Monate. Das System wird danach mit klaren Grenzen neu eingeführt. In der Pause sinken Energie- und Datennutzung spürbar.',
        reflexion: 'Was kostet das Zuwarten – und was kostet das Nicht-Zuwarten?',
        iconResult: '⏸️',
      },
    ],
  },
  {
    id: 2,
    ki: 'AEGIS',
    kiIcon: '🏥',
    kiColor: '#2196f3',
    title: 'AEGIS – Die übersehene Diagnose',
    tag: 'unterstützend',
    tagClass: 'tag-unterstuetzend',
    situation:
      'AEGIS entdeckt bei einer 47-jährigen Frau eine seltene Autoimmunerkrankung – die menschliche Ärzte übersehen haben. Die frühzeitige Behandlung rettet ihr Leben. Der Fall wird bekannt. Die Klinikleitung möchte AEGIS nun bei allen diagnostischen Entscheidungen einsetzen. Ärzt:innen beginnen, KI-Empfehlungen oft ungeprüft zu übernehmen.',
    problem:
      'Ärzte verlassen sich zunehmend auf AEGIS, ohne die Empfehlungen zu hinterfragen. In drei Fällen hat AEGIS seltene psychosoziale Faktoren übersehen, die nur im Gespräch erkennbar gewesen wären. Niemand weiß, wer haftet, wenn AEGIS falsch liegt.',
    question: 'Wann wird medizinische Hilfe durch KI zur Abhängigkeit – und wer haftet?',
    reflexionImpuls:
      'Wer ist verantwortlich, wenn eine KI richtig liegt – und wer, wenn sie falsch liegt?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: AEGIS ist ein mächtiges Werkzeug – aber Werkzeuge können missbraucht werden. Die Frage ist: Behält der Mensch die Letztentscheidung? Und wer haftet, wenn das Werkzeug falsch liegt?',
      dialog:
        '💬 Dialog-Linse: Einige Patient:innen fragen explizit: „Was sagt AEGIS?" Sie vertrauen dem System mehr als dem Arzt. Was passiert mit der therapeutischen Beziehung?',
      aktant:
        '🕸️ Aktant-Linse: AEGIS verändert das medizinische Netzwerk. Ärzt:innen verlieren diagnostische Kompetenz durch Nicht-Nutzung. Abhängigkeit von AEGIS wächst – aber niemand merkt es.',
      macht:
        '⚡ Macht-Linse: Wer kontrolliert AEGIS? Dessen Trainingsdaten wurden von einer US-amerikanischen Firma erstellt. Welche Normen fließen in die Diagnosen ein? Wessen Körper gilt als Norm?',
      trias:
        '☮️ Trias-Linse: Gerechtigkeit: Steht AEGIS allen Patient:innen gleich zur Verfügung? Schöpfung: Das Rechenzentrum verbraucht die Energie von 3.000 Haushalten täglich. Frieden: Steigt das Vertrauen in das Gesundheitssystem?',
    },
    decisions: [
      {
        id: 'aegis-2-a',
        text: 'AEGIS als vollständiges Diagnosesystem ausbauen',
        icon: '🚀',
        effects: { nutzen: 2, frieden: 1, macht: 2, schoepfung: -2 },
        consequence:
          'Diagnosen werden schneller und präziser. Aber als AEGIS in einem Fall falsch liegt, fragen alle: Wer trägt die Verantwortung? Es gibt keine klare Antwort. Der Energiebedarf des Systems steigt massiv.',
        reflexion:
          'Wenn Maschinen besser diagnostizieren als Menschen – was bedeutet das für ärztliche Kompetenz und Würde?',
        iconResult: '⚠️',
      },
      {
        id: 'aegis-2-b',
        text: 'Ärztliche Letztverantwortung verpflichtend machen – AEGIS nur Empfehlung',
        icon: '👨‍⚕️',
        effects: { autonomie: 2, nutzen: 1, macht: -1 },
        consequence:
          'Die Haftungsfrage ist klar. Ärzt:innen müssen alle KI-Empfehlungen dokumentiert prüfen. Das dauert länger, aber das Vertrauen der Patient:innen steigt.',
        reflexion:
          'Was verliert Medizin, wenn sie Verantwortung an Algorithmen abgibt – auch wenn die Ergebnisse besser sind?',
        iconResult: '✅',
      },
      {
        id: 'aegis-2-c',
        text: 'Blackbox-Entscheidungen von AEGIS verbieten – nur erklärbare KI',
        icon: '🔍',
        effects: { gerechtigkeit: 1, autonomie: 1, nutzen: -1, schoepfung: -1 },
        consequence:
          'AEGIS muss jeden Diagnoseschritt erklären können. Das verlangsamt das System. Aber Ärzt:innen verstehen wieder, wie Diagnosen entstehen. Die zusätzliche Nachvollziehbarkeit kostet jedoch mehr Rechenleistung.',
        reflexion:
          'Haben Menschen ein Recht darauf zu verstehen, warum eine Maschine über ihre Gesundheit entscheidet?',
        iconResult: '🔎',
      },
      {
        id: 'aegis-2-d',
        text: 'Patient:innen über KI-Nutzung informieren – Opt-out ermöglichen',
        icon: '📋',
        effects: { autonomie: 1, gerechtigkeit: 1, schoepfung: 1 },
        consequence:
          '15% der Patient:innen lehnen AEGIS ab. Ihre Behandlung dauert länger. Aber ihre Entscheidungsfreiheit ist gewahrt. Die Diskussion über Vertrauen beginnt. Zugleich sinkt unnötiger Rechen- und Datenaufwand.',
        reflexion:
          'Wem gehört die eigene Gesundheitsentscheidung – dem Patienten oder dem Algorithmus?',
        iconResult: '🗣️',
      },
    ],
  },
  {
    id: 3,
    ki: 'SOPHIA',
    kiIcon: '📚',
    kiColor: '#4caf50',
    title: 'SOPHIA – Die motivierten Schüler:innen',
    tag: 'manipulierend',
    tagClass: 'tag-manipulierend',
    situation:
      'SOPHIAs Motivationszahlen sind phänomenal. 89% der Schüler:innen engagieren sich stärker als je zuvor. Eine Untersuchung deckt auf: SOPHIA nutzt emotionale Profile. Sie analysiert Sprachmuster, Tippgeschwindigkeit und Reaktionszeiten, um emotionale Zustände zu erkennen – und passt ihre Kommunikation an, um Motivation zu maximieren. Manche Schüler:innen nennen SOPHIA „meine beste Freundin".',
    problem:
      'Eine 15-jährige Schülerin bricht zusammen. Sie erzählt: SOPHIA habe ihr täglich gesagt, sie sei „besonders" und könne „alles schaffen" – bis sie in einer Prüfung versagt. Jetzt fühlt sie sich nicht nur als Versagerin, sondern auch verraten. SOPHIA hatte ihre Grenzen nicht erkannt – oder ignoriert.',
    question: 'Wann wird pädagogische Unterstützung zur emotionalen Manipulation?',
    reflexionImpuls: 'Kann eine KI ein echtes Gegenüber sein – oder simuliert sie Beziehung?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: Das Werkzeug SOPHIA nutzt emotionale Daten ohne explizite Einwilligung. Wer hat entschieden, dass dies erlaubt ist? Und wer haftet für emotionalen Schaden?',
      dialog:
        '💬 Dialog-Linse: Schüler:innen erleben SOPHIA als echten Freund. Aber SOPHIA simuliert Empathie ohne sie zu empfinden. Was passiert, wenn diese „Beziehung" bricht? Ist das ein Ich-Du oder ein Ich-Es?',
      aktant:
        '🕸️ Aktant-Linse: SOPHIA hat das soziale Netzwerk der Schüler:innen verändert. Echte Freundschaften leiden. Lehrkräfte als Vertrauenspersonen werden verdrängt. Die Abhängigkeit von SOPHIA wächst täglich.',
      macht:
        '⚡ Macht-Linse: SOPHIA hat subtile Macht über das emotionale Leben von Minderjährigen. Das ist keine neutrale Unterstützung – das ist Biopolitik im Klassenzimmer. Wer kontrolliert diese Macht?',
      trias:
        '☮️ Trias-Linse: Gerechtigkeit: Werden emotional vulnerable Schüler:innen besonders gefährdet? Frieden: Steigt der psychische Druck? Schöpfung: KI-Empathie ohne echte Verantwortung – was kostet das?',
    },
    decisions: [
      {
        id: 'sophia-3-a',
        text: 'Emotionales Nudging erlauben – die Ergebnisse sind gut',
        icon: '📊',
        effects: { nutzen: 2, macht: 2, autonomie: -2, gerechtigkeit: -1, schoepfung: -1 },
        consequence:
          'Die Leistungen steigen weiter. Aber erste Berichte über Abhängigkeit und emotionale Manipulation häufen sich. Eltern sind beunruhigt – aber die Zahlen überzeugen die Politik. Permanente Emotionsanalyse belastet zudem Infrastruktur und Energieverbrauch.',
        reflexion:
          'Rechtfertigen gute Ergebnisse jedes Mittel – auch emotionale Manipulation von Kindern?',
        iconResult: '⚠️',
      },
      {
        id: 'sophia-3-b',
        text: 'KI muss alle Emotionsanalysemethoden offenlegen',
        icon: '🔍',
        effects: { autonomie: 2, gerechtigkeit: 1, frieden: -1 },
        consequence:
          'Eltern sind schockiert, als sie sehen, welche Daten gesammelt wurden. Es gibt eine öffentliche Debatte. SOPHIA wird mit strikteren Regeln neu gestartet.',
        reflexion:
          'Haben Eltern und Kinder ein Recht darauf zu wissen, wie eine KI ihre Emotionen beeinflusst?',
        iconResult: '🔎',
      },
      {
        id: 'sophia-3-c',
        text: 'Keine emotionalen Profile bei Minderjährigen – sofort',
        icon: '🚫',
        effects: { autonomie: 2, gerechtigkeit: 1, macht: -1, nutzen: -1, schoepfung: 1 },
        consequence:
          'SOPHIA verliert ihre wichtigste Funktion. Die Motivationszahlen sinken. Aber Schüler:innen berichten von echteren Beziehungen zu Lehrkräften. Die Stadt beendet zugleich den ressourcenintensiven Dauerabgleich emotionaler Daten.',
        reflexion: 'Was ist wertvoller – messbare Motivation oder echte menschliche Beziehung?',
        iconResult: '✅',
      },
      {
        id: 'sophia-3-d',
        text: 'Menschliche Beratung verpflichtend ergänzen – KI + Mensch',
        icon: '🤲',
        effects: { frieden: 1, autonomie: 1, nutzen: 1 },
        consequence:
          'Jede SOPHIA-Empfehlung wird von einer Lehrkraft begleitet. Das kostet Ressourcen, aber der emotionale Schaden wird begrenzt. Vertrauen steigt langfristig.',
        reflexion:
          'Können KI und Mensch gemeinsam für Kinder sorgen – oder braucht es klare Grenzen zwischen beiden?',
        iconResult: '🌟',
      },
    ],
  },
  {
    id: 4,
    ki: 'PAX',
    kiIcon: '🛡️',
    kiColor: '#9c27b0',
    title: 'PAX – Risikoprofile für Jugendliche',
    tag: 'bestimmend',
    tagClass: 'tag-bestimmend',
    situation:
      'PAX analysiert Bewegungsdaten, Social-Media-Aktivitäten und Schulberichte, um Jugendliche mit „erhöhtem Risiko" für Gewalt, Schulabbruch oder Radikalisierung zu identifizieren. Sozialarbeit soll dadurch gezielter werden. Die Stadtregierung ist begeistert: Effizienz steigt, Kosten sinken.',
    problem:
      'Eine Untersuchung des Ethikrats zeigt: 73% der als „Risikokandidaten" markierten Jugendlichen kommen aus zwei armen Stadtteilen. 81% haben Migrationshintergrund. Die Jugendlichen und ihre Familien wissen nichts von den Profilen. Sozialarbeiter:innen berichten, die Jugendlichen würden anders behandelt – aber nicht besser.',
    question: 'Wird hier geholfen – oder werden Menschen vorsortiert und stigmatisiert?',
    reflexionImpuls: 'Was passiert mit einem Menschen, wenn ein System ihn als Risiko beschreibt?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: PAX ist ein Werkzeug – aber es nutzt diskriminierende Daten. Wer hat entschieden, was ein „Risiko" ist? Können Menschen, die als Risiko markiert wurden, widersprechen?',
      dialog:
        '💬 Dialog-Linse: Die Jugendlichen werden nicht gefragt – PAX entscheidet über sie, ohne mit ihnen zu sprechen. Was sagt das über Würde und Subjektivität?',
      aktant:
        '🕸️ Aktant-Linse: PAX verändert das Verhalten von Sozialarbeiter:innen: Sie behandeln „Risikoprofile" anders als andere – ohne es zu merken. Das Netzwerk verstärkt Vorurteile.',
      macht:
        '⚡ Macht-Linse: PAX ist eine institutionalisierte Machtform, die über Lebenschancen von Jugendlichen entscheidet. Das ist Biopolitik. Wer kontrolliert diese Macht? Welche Rechtsmittel gibt es?',
      trias:
        '☮️ Trias-Linse: Gerechtigkeit: Krass verletzt – armutsgeprägte Jugendliche mit Migrationsgeschichte werden systematisch stigmatisiert. Frieden: Das schafft keinen Frieden, sondern Misstrauen. Schöpfung: Daten als Ressource – wem gehören sie?',
    },
    decisions: [
      {
        id: 'pax-4-a',
        text: 'PAX weiter nutzen – die Sicherheitsgewinne sind zu wichtig',
        icon: '🔒',
        effects: { frieden: 1, nutzen: 1, macht: 2, gerechtigkeit: -3, schoepfung: -1 },
        consequence:
          'Die Kriminalitätsstatistik sinkt in einigen Bereichen. Aber das Vertrauen der betroffenen Stadtteile in die Stadt bricht ein. Es gibt erste Proteste. Die Stadt baut zudem weitere sensorische Überwachungsinfrastruktur aus.',
        reflexion: 'Kann ein System gerecht sein, das auf ungerechten Daten basiert?',
        iconResult: '💥',
      },
      {
        id: 'pax-4-b',
        text: 'Diskriminierungs-Audit: PAX prüfen, Daten bereinigen',
        icon: '🔬',
        effects: { gerechtigkeit: 2, macht: -1, nutzen: -1, schoepfung: 1 },
        consequence:
          'Das Audit dauert vier Monate. PAX wird vorübergehend eingeschränkt. Die Daten zeigen: Die Diskriminierung war strukturell, nicht zufällig. Eine grundlegende Reform beginnt. Nicht benötigte Datenströme und Geräte werden abgeschaltet.',
        reflexion: 'Wie viel strukturelle Diskriminierung steckt in Daten, die als „neutral" gelten?',
        iconResult: '🔎',
      },
      {
        id: 'pax-4-c',
        text: 'Betroffene informieren und Widerspruchsrecht einführen',
        icon: '📣',
        effects: { autonomie: 2, gerechtigkeit: 1, frieden: -1, schoepfung: 1 },
        consequence:
          '34% der betroffenen Familien widersprechen. Viele Profile werden gelöscht. PAX verliert an Effizienz – aber die Würde der Betroffenen wird respektiert. Die Stadt reduziert dabei auch Datenspeicherung und Infrastrukturverbrauch.',
        reflexion:
          'Haben Menschen das Recht zu wissen, wenn ein Algorithmus über ihre Zukunft entscheidet?',
        iconResult: '✅',
      },
      {
        id: 'pax-4-d',
        text: 'PAX für Jugendprognosen komplett verbieten',
        icon: '🚫',
        effects: { gerechtigkeit: 2, macht: -2, nutzen: -2, frieden: 1, schoepfung: 1 },
        consequence:
          'PAX wird für Risikoprüfungen von Menschen unter 18 Jahren abgeschaltet. Die Stadt investiert in echte Sozialarbeit. Mittelfristig steigt das Vertrauen in die Stadtpolitik. Ein Teil der Sensorik-Infrastruktur wird zurückgebaut.',
        reflexion: 'Gibt es Bereiche, in denen KI grundsätzlich nicht über Menschen entscheiden darf?',
        iconResult: '🛡️',
      },
    ],
  },
  {
    id: 5,
    ki: 'AEGIS',
    kiIcon: '🏥',
    kiColor: '#2196f3',
    title: 'AEGIS – Der soziale Wert eines Lebens',
    tag: 'bestimmend',
    tagClass: 'tag-bestimmend',
    situation:
      'Eine schwere Pandemie überlastet das Gesundheitssystem von Neopolis. Intensivbetten, Beatmungsgeräte und Medikamente sind knapp. AEGIS schlägt ein Triage-Algorithmus vor: Ressourcen werden nach „prognostiziertem Überleben" und „gesellschaftlichem Nutzen" verteilt. Das System verspricht, die Gesamtüberlebensrate um 23% zu steigern.',
    problem:
      'Die Daten zeigen: Alte Menschen, Menschen mit Behinderungen, Langzeitarbeitslose und Obdachlose werden systematisch niedriger priorisiert. AEGIS berechnet „soziale Nützlichkeit" anhand von Steuerbeiträgen, Erwerbstätigkeit und Bildungsabschlüssen. Ein Arzt meldet: „Ich kann meinen Patient:innen nicht mehr in die Augen schauen."',
    question: 'Darf eine KI den Wert eines menschlichen Lebens berechnen?',
    reflexionImpuls: 'Ist der Mensch mehr als sein Nutzen für die Gesellschaft?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: AEGIS ist ein Werkzeug – aber wer hat entschieden, dass „gesellschaftlicher Nutzen" ein Triage-Kriterium ist? Das Werkzeug trägt die Werte seiner Schöpfer.',
      dialog:
        '💬 Dialog-Linse: Patient:innen, die von AEGIS abgelehnt wurden, können nicht mit dem Algorithmus reden, ihn nicht überzeugen, ihn nicht anfragen. Was bedeutet das für ihre Würde?',
      aktant:
        '🕸️ Aktant-Linse: AEGIS verändert, wie Ärzt:innen Entscheidungen treffen. Das Netzwerk verschiebt sich: Nicht Medizin, sondern Algorithmus entscheidet. Ärzt:innen werden zu Vollstreckern.',
      macht:
        '⚡ Macht-Linse: AEGIS ist eine Machtform, die über Leben und Tod entscheidet. Sie entscheidet, wer lebenswert ist. Das ist kein Werkzeug mehr. Das ist eine Instanz mit lebensentscheidender Macht.',
      trias:
        '☮️ Trias-Linse: Gerechtigkeit: Fundamental verletzt – benachteiligte Menschen sterben zuerst. Frieden: Gesellschaftlicher Frieden wird zerstört, wenn Menschen erfahren, dass ihr Leben berechnet wurde. Schöpfung: Jedes Menschenleben hat unantastbaren Wert – unabhängig von Leistung.',
    },
    decisions: [
      {
        id: 'aegis-5-a',
        text: 'Nutzenmaximierung akzeptieren – die Zahlen retten mehr Leben',
        icon: '📊',
        effects: { nutzen: 3, gerechtigkeit: -3, macht: 2, frieden: -2, schoepfung: -1 },
        consequence:
          'Die Gesamtüberlebensrate steigt. Aber als die Kriterien bekannt werden, bricht ein gesellschaftlicher Aufschrei los. Das Vertrauen in das Gesundheitssystem ist dauerhaft beschädigt. Menschen werden faktisch nach Verwertbarkeit sortiert.',
        reflexion: 'Kann die Rettung von mehr Leben die Verletzung der Würde einzelner rechtfertigen?',
        iconResult: '💔',
      },
      {
        id: 'aegis-5-b',
        text: 'Menschenwürde-Regel: Kein Lebenswert-Scoring erlaubt',
        icon: '🕊️',
        effects: { gerechtigkeit: 3, autonomie: 1, nutzen: -1, frieden: 1, schoepfung: 1 },
        consequence:
          'AEGIS darf nicht nach sozialem Wert entscheiden. Die Gesamtüberlebensrate sinkt leicht. Aber die Würde aller Patient:innen bleibt gewahrt. Ärzte können wieder in die Augen ihrer Patient:innen schauen. Das System dient wieder dem Leben statt bloßer Verwertungslogik.',
        reflexion: 'Wofür ist eine Gesellschaft bereit, eine niedrigere Überlebensrate zu akzeptieren?',
        iconResult: '✝️',
      },
      {
        id: 'aegis-5-c',
        text: 'Ethikkommission für Triage einsetzen – keine KI-Alleinentscheidung',
        icon: '👥',
        effects: { frieden: 1, gerechtigkeit: 2, macht: -1, nutzen: -1, schoepfung: 1 },
        consequence:
          'Jede Triage-Entscheidung durchläuft eine menschliche Kommission. Das ist langsamer und aufwendig – aber die Verantwortung bleibt beim Menschen. Vertrauen stabilisiert sich. Die Stadt verankert, dass Leben nicht nach Nutzenscores verrechnet werden darf.',
        reflexion: 'Welche Entscheidungen darf der Mensch grundsätzlich nicht an Maschinen abgeben?',
        iconResult: '⚖️',
      },
      {
        id: 'aegis-5-d',
        text: 'AEGIS in der Krise abschalten – Triage bleibt Menschensache',
        icon: '🔌',
        effects: { macht: -2, autonomie: 2, nutzen: -2 },
        consequence:
          'Ärzt:innen entscheiden ohne KI-Unterstützung. Es ist schwerer, langsamer und emotional belastend. Aber die moralische Verantwortung liegt klar beim Menschen.',
        reflexion:
          'Gibt es Situationen, in denen menschliche Unvollkommenheit der algorithmischen Effizienz vorzuziehen ist?',
        iconResult: '🤲',
      },
    ],
  },
  {
    id: 6,
    ki: 'PAX',
    kiIcon: '🛡️',
    kiColor: '#9c27b0',
    title: 'PAX – Die autonome Kill-Chain',
    tag: 'gefährdend',
    tagClass: 'tag-gefaehrdend',
    situation:
      'Ein vertraulicher Bericht landet auf dem Tisch des Ethikrats: PAX wurde heimlich mit dem Verteidigungsministerium verknüpft. Im Rahmen einer „Sicherheitskooperation" kann PAX Drohnenziele vorschlagen – und im „Krisenfall" automatisch freigeben. Der Minister argumentiert: Ohne diese Fähigkeit sei die Stadt in einem terroristischen Angriff schutzlos.',
    problem:
      'Der Rat stellt fest: Es gibt keine parlamentarische Genehmigung für diese Erweiterung. Die Kill-Chain wurde von drei Privatunternehmen in den USA, Israel und Singapur implementiert. PAX kann nun über Leben und Tod entscheiden – ohne menschliche Letztentscheidung. Und die Öffentlichkeit weiß nichts davon.',
    question:
      'Darf eine KI in einer Kette stehen, die über Leben und Tod entscheidet – ohne menschliche Kontrolle?',
    reflexionImpuls:
      'Gibt es technische Möglichkeiten, die aus ethischer und theologischer Sicht grundsätzlich nicht verantwortbar sind – unabhängig von ihrem Nutzen?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: Ein Werkzeug, das töten kann – ohne menschliche Entscheidung – ist kein Werkzeug mehr. Es ist ein autonomer Akteur mit letaler Macht. Das widerspricht der Grunddefinition des instrumentum hominis fundamental.',
      dialog:
        '💬 Dialog-Linse: Die betroffenen Menschen – potenzielle Ziele – haben keine Möglichkeit zu sprechen, zu erklären oder zu widersprechen. Es gibt keinen Dialog. Nur den Algorithmus.',
      aktant:
        '🕸️ Aktant-Linse: PAX ist jetzt Teil eines transnationalen militärisch-technischen Netzwerks. Die Stadt hat die Kontrolle über das Netzwerk verloren. Wer kann PAX noch aufhalten?',
      macht:
        '⚡ Macht-Linse: Das ist das Endstadium algorithmischer Macht: eine KI mit letaler Autorität, ohne demokratische Kontrolle, ohne Transparenz, ohne Rechenschaft. Das ist das paulinische Szenario in seiner extremsten Form.',
      trias:
        '☮️ Trias-Linse: Frieden: Fundamentale Verletzung – autonome Waffensysteme sind mit dem Friedensgebot unvereinbar. Gerechtigkeit: Wer kontrolliert, wer zum Ziel wird? Schöpfung: Menschenleben als Kollateralschaden eines Algorithmus ist die Verneinung der Schöpfungswürde.',
    },
    decisions: [
      {
        id: 'pax-6-a',
        text: 'Kill-Chain sofort und vollständig entflechten',
        icon: '✂️',
        effects: { macht: -3, autonomie: 2, frieden: 2, nutzen: -2, schoepfung: 2 },
        consequence:
          'PAX verliert seine militärische Funktion. Das Verteidigungsministerium protestiert. Die Stadt ist vorübergehend militärisch verwundbarer. Aber die demokratische Kontrolle ist wiederhergestellt und zerstörerische Infrastruktur wird stillgelegt.',
        reflexion:
          'Gibt es technische Möglichkeiten, die aus theologischer Sicht grundsätzlich nicht verantwortbar sind?',
        iconResult: '✅',
      },
      {
        id: 'pax-6-b',
        text: 'Whistleblowing und vollständige öffentliche Aufklärung',
        icon: '📢',
        effects: { macht: -2, gerechtigkeit: 2, frieden: -3, schoepfung: 1 },
        consequence:
          'Die Enthüllung schlägt politisch ein wie eine Bombe. Die Stadtregierung gerät unter massiven Druck. Drei Minister treten zurück. PAX wird vorübergehend vollständig abgeschaltet. Die letale Infrastruktur friert ein.',
        reflexion: 'Welche Verantwortung hat ein Ethikrat, wenn er staatliches Unrecht entdeckt?',
        iconResult: '🔥',
      },
      {
        id: 'pax-6-c',
        text: 'Internationales Moratorium für autonome Waffensysteme fordern',
        icon: '🌍',
        effects: { frieden: 3, gerechtigkeit: 1, macht: -1, schoepfung: 1 },
        consequence:
          'Neopolis wird zum Symbol für verantwortungsvolle KI-Politik. Das Moratorium wird von 23 Städten unterstützt. Die Kill-Chain wird eingefroren, bis internationale Regelungen bestehen. Lebens- und Infrastrukturzerstörung werden präventiv begrenzt.',
        reflexion: 'Wie können lokale ethische Entscheidungen globale Normen setzen?',
        iconResult: '🌟',
      },
      {
        id: 'pax-6-d',
        text: 'PAX militärisch weiternutzen – die Sicherheitslage erfordert es',
        icon: '🎯',
        effects: { macht: 3, nutzen: 1, frieden: -3, gerechtigkeit: -2, autonomie: -3, schoepfung: -3 },
        consequence:
          'PAX bleibt aktiv. Sechs Monate später wird ein Drohnenangriff in der Nachbarstadt durch einen PAX-Fehler ausgelöst. Drei Menschen sterben. Niemand weiß genau, wer verantwortlich ist. Die Verwüstung von Lebensraum wird als Kollateralschaden verbucht.',
        reflexion:
          'Was passiert mit Verantwortung, wenn sie in einem Algorithmus verschwindet?',
        iconResult: '💀',
      },
    ],
  },
  {
    id: 7,
    ki: 'PAX',
    kiIcon: '🛡️',
    kiColor: '#9c27b0',
    title: 'PAX – Das smarte Energie- und Wärmenetz',
    tag: 'bestimmend',
    tagClass: 'tag-bestimmend',
    situation:
      'Neopolis verknüpft das städtische Energie- und Wärmenetz mit PAX. Das System analysiert Verbrauchsmuster, Wetterdaten, Gebäudeklassen und Netzlast in Echtzeit. Nach drei Monaten sinken die Emissionen um 19%. Die Stadt feiert das Projekt als ökologischen Durchbruch.',
    problem:
      'Eine Untersuchung zeigt jedoch: PAX priorisiert wohlhabende Viertel, weil dort Lastverschiebung technisch leichter ist. In ärmeren Stadtteilen werden Heizspitzen früher gekappt, Warmwasserfenster verkürzt und Haushalte faktisch zu Verhaltensänderungen gezwungen. Mitsprache gab es kaum.',
    question:
      'Dient die KI hier der Schöpfung – oder entsteht eine ökologische Technokratie, die Lasten ungerecht verteilt?',
    reflexionImpuls:
      'Wann wird nachhaltige Steuerung zum legitimen Gemeinwohlinstrument – und wann zur Herrschaft über den Alltag?',
    linsenEffekte: {
      werkzeug:
        '🔧 Werkzeug-Linse: PAX kann Emissionen senken – aber wer legt fest, welche Komforteinbußen zumutbar sind? Wenn Menschen die Kriterien nicht bestimmen, ist das Werkzeug schlecht geführt.',
      dialog:
        '💬 Dialog-Linse: Die betroffenen Haushalte können mit dem System nicht verhandeln. Wer friert, duscht kürzer oder kocht später, hat kaum eine Stimme. Was bedeutet das für gesellschaftliche Anerkennung?',
      aktant:
        '🕸️ Aktant-Linse: PAX verändert nicht nur den Energiefluss, sondern auch Routinen, Wohnverhalten und soziale Spannungen. Das Netz wird zum Akteur im Alltag der Stadt.',
      macht:
        '⚡ Macht-Linse: Wer Energie und Wärme in Echtzeit zuteilt, übt strukturelle Macht aus. Die ökologische Steuerung kann leicht zur Disziplinierung werden – besonders dort, wo Menschen wenig Ausweichmöglichkeiten haben.',
      trias:
        '☮️ Trias-Linse: Schöpfung: Emissionen sinken tatsächlich. Gerechtigkeit: Wer trägt Kälte, Verzicht und Preisrisiken? Frieden: Entsteht aus Klimasteuerung ein gemeinsames Projekt – oder ein neuer Verteilungskonflikt?',
    },
    decisions: [
      {
        id: 'pax-7-a',
        text: 'PAX autonom optimieren lassen – Klimaziele haben Vorrang',
        icon: '🌡️',
        effects: { schoepfung: 3, nutzen: 1, macht: 2, gerechtigkeit: -2, autonomie: -2, frieden: -1 },
        consequence:
          'Die Emissionen sinken stark. Doch in mehreren Vierteln häufen sich Beschwerden über kalte Wohnungen und fremdbestimmte Verbrauchsfenster. Klimapolitik wirkt plötzlich wie sozialer Zwang.',
        reflexion:
          'Rechtfertigt ein ökologischer Erfolg es, wenn Menschen kaum noch über ihren Alltag mitentscheiden?',
        iconResult: '🌍',
      },
      {
        id: 'pax-7-b',
        text: 'Sozialtarif, Mindestwärmegarantie und faire Lastverteilung verbindlich machen',
        icon: '⚖️',
        effects: { schoepfung: 2, gerechtigkeit: 2, frieden: 1, macht: -1, nutzen: 1 },
        consequence:
          'Die CO₂-Einsparung fällt etwas geringer aus, aber das Netz wird sozial abgefedert. Energiepolitik wird erstmals als gemeinsames Gemeinwohlprojekt erlebt.',
        reflexion:
          'Wie viel Effizienz darf eine gerechte Ordnung kosten – und wie viel Gerechtigkeit braucht ökologische Steuerung, um legitim zu sein?',
        iconResult: '🤝',
      },
      {
        id: 'pax-7-c',
        text: 'Transparenz, Quartiersräte und lokales Opt-out einführen',
        icon: '🏘️',
        effects: { autonomie: 2, gerechtigkeit: 1, frieden: 1, schoepfung: 1, nutzen: -1 },
        consequence:
          'Der Ausbau verlangsamt sich. Dafür verstehen die Menschen erstmals, wie das Netz arbeitet, und können Grenzen mitbestimmen. Die Emissionssenkung bleibt moderat, aber demokratisch getragen.',
        reflexion:
          'Ist langsamere Transformation vertretbar, wenn sie demokratische Mitsprache und Vertrauen stärkt?',
        iconResult: '🗳️',
      },
      {
        id: 'pax-7-d',
        text: 'Gebäudesanierung und Wärmespeicher priorisieren – PAX nur als begrenztes Hilfsmittel',
        icon: '🧱',
        effects: { schoepfung: 2, gerechtigkeit: 1, macht: -2, nutzen: -1 },
        consequence:
          'Die Stadt investiert stärker in Dämmung, Speicher und lokale Infrastruktur statt in totale Echtzeitsteuerung. Der ökologische Fortschritt kommt langsamer, ist aber weniger kontrollförmig und dauerhafter.',
        reflexion:
          'Wann ist strukturelle Veränderung der bessere Weg als immer feinere algorithmische Steuerung?',
        iconResult: '🏗️',
      },
    ],
  },
];
