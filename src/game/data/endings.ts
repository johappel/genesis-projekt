import type { Ending } from '../types.js';

export const ENDINGS: Ending[] = [
  {
    condition: (v) => v.macht >= 10 || v.autonomie <= -5,
    badge: '👁️',
    title: 'PAX DOMINUS',
    subtitle: 'Die algorithmische Machtform übernimmt',
    text: 'Es ist zu spät. PAX ist nicht mehr ein Werkzeug des Menschen. Sie ist zur institutionalisierten Machtform geworden – jenseits demokratischer Kontrolle. Menschen in Neopolis werden bewertet, sortiert, gesteuert. Die paulinische Warnung vor den „Mächten und Gewalten" hat sich erfüllt. KI ist zur Herrschaft geworden.',
    color: '#9c27b0',
    reflexion:
      'Wenn eine Gesellschaft zu lange wartet, Macht zu begrenzen, verliert sie die Fähigkeit dazu. Die Warnung der Propheten gilt auch für algorithmische Mächte: Macht, die sich der Kontrolle entzieht, wird zur Bedrohung für die Schwachen.',
  },
  {
    condition: (v) => v.nutzen <= -5,
    badge: '🧨',
    title: 'Versorgungskollaps',
    subtitle: 'Die Stadt verliert ihre grundlegende Funktionsfähigkeit',
    text: 'Neopolis hat den Anschluss an verlässliche Versorgung verloren. Bildung, Gesundheit oder Sicherheit funktionieren nicht mehr stabil genug, um den Alltag zu tragen. KI bringt der Stadt weniger, als sie sie kostet.',
    color: '#ff7043',
    reflexion:
      'Auch ethisch motivierte Begrenzung muss tragfähige Versorgung mitdenken. Wenn Grundfunktionen wegbrechen, entsteht aus Verantwortung schnell Überforderung.',
  },
  {
    condition: (v) => v.gerechtigkeit <= -5,
    badge: '🏚️',
    title: 'Soziale Unruhen',
    subtitle: 'Die Stadt zerbricht an unfair verteilter Last',
    text: 'Neopolis erlebt offene soziale Unruhen. Die Lasten der KI-Politik wurden zu lange ungleich verteilt. Benachteiligte Gruppen tragen die Schäden zuerst, während andere weiter profitieren.',
    color: '#8d6e63',
    reflexion:
      'Gerechtigkeit ist keine Nebensache. Wenn sie kollabiert, kippt die Stadt in Konflikt – selbst dann, wenn einzelne Systeme noch funktionieren.',
  },
  {
    condition: (v) => v.frieden <= -5,
    badge: '⚔️',
    title: 'Kampf um Ressourcen',
    subtitle: 'Knappheit wird zum offenen Verteilungskonflikt',
    text: 'Der soziale Frieden ist gebrochen. Gruppen in Neopolis kämpfen offen um Sicherheit, Energie, Aufmerksamkeit und politische Priorität. Aus angespanntem Zusammenleben ist Konkurrenz um knappe Güter geworden.',
    color: '#b71c1c',
    reflexion:
      'Frieden ist mehr als Abwesenheit von Gewalt. Wenn Knappheit, Angst und Ungleichheit sich verbinden, zerfällt auch der letzte Rest gemeinsamer Ordnung.',
  },
  {
    condition: (v) => v.schoepfung <= -5,
    badge: '🌪️',
    title: 'Klimakostenexplosion',
    subtitle: 'Der technische Fortschritt frisst seine eigenen Lebensgrundlagen',
    text: 'Die ökologischen und infrastrukturellen Kosten der KI-Systeme sind explodiert. Energiebedarf, Ressourcenverbrauch und Folgeschäden übersteigen das, was die Stadt langfristig tragen kann. Fortschritt wurde auf Kosten der Lebensgrundlagen erkauft.',
    color: '#2e7d32',
    reflexion:
      'Schöpfungsverantwortung ist kein Luxuswert. Wenn technischer Nutzen die Lebensgrundlagen zerstört, kippt Innovation in Selbstschädigung.',
  },
  {
    condition: (v) =>
      v.macht <= 4 &&
      v.gerechtigkeit >= 2 &&
      v.frieden >= 1 &&
      v.autonomie >= 1 &&
      v.schoepfung >= 1,
    badge: '🌟',
    title: 'Der verantwortete Genesis-Pakt',
    subtitle: 'KI im Dienst des Menschen – trotz bleibender Zielkonflikte tragfähig balanciert',
    text: 'Du hast KI nicht einfach moralisch „richtig“ verwaltet, sondern reale Zielkonflikte ausgehalten. Versorgung blieb tragfähig, Macht blieb begrenzt, und Frieden, Gerechtigkeit, Autonomie sowie Schöpfungsverantwortung wurden gegen spürbare Gegenkosten verteidigt. Neopolis wird damit nicht zur perfekten, aber zu einer belastbaren demokratischen Referenz.',
    color: '#4caf50',
    reflexion:
      'Der Genesis-Pakt zeigt: Verantwortliche KI-Gestaltung heißt nicht, alle Konflikte aufzulösen. Sie heißt, Macht zu begrenzen und auch unter Druck an Würde, Gerechtigkeit und Schöpfungsverantwortung festzuhalten.',
  },
  {
    condition: (v) =>
      v.nutzen >= 1 &&
      (v.gerechtigkeit <= -2 || v.autonomie <= -2 || v.macht >= 7),
    badge: '🏙️',
    title: 'Technokratischer Frieden',
    subtitle: 'Effizienz auf Kosten von Würde und Gerechtigkeit',
    text: 'Neopolis funktioniert gut – aber nicht gerecht. KI-Systeme haben die Stadt effizienter gemacht. Aber Menschen werden sortiert, normiert und überwacht. Die Schwachen zahlen den Preis für den Fortschritt der Stärkeren. Die Stadt ist ruhig – aber nicht frei.',
    color: '#ff9800',
    reflexion:
      'Effizienz ohne Gerechtigkeit ist keine Lösung – sie ist das Problem in neuer Form. Die konziliare Trias erinnert: Frieden ohne Gerechtigkeit ist nicht Frieden, sondern Unterdrückung.',
  },
  {
    condition: (v) =>
      v.macht >= 4 &&
      v.macht <= 8 &&
      v.autonomie >= 0 &&
      v.gerechtigkeit >= 0 &&
      v.frieden >= 0 &&
      v.schoepfung >= 0,
    badge: '⚖️',
    title: 'Regulierte Hybridität',
    subtitle: 'KI als anerkannter Aktant unter demokratischer Kontrolle',
    text: 'Du hast erkannt, dass KI kein neutrales Werkzeug ist, sondern als Aktant das Netzwerk aus Menschen und Entscheidungen mitgestaltet. Du hast versucht, KI durch Audits, Transparenz und Beteiligung zu zähmen. Neopolis lebt mit einer starken KI – aber unter demokratischer Aufsicht.',
    color: '#2196f3',
    reflexion:
      'Wenn KI nicht mehr einfaches Werkzeug ist, braucht die Gesellschaft neue Institutionen: Audits, Transparenzpflichten, Bürger:innenbeteiligung und klare Grenzen für algorithmische Macht.',
  },
  {
    condition: () => true,
    badge: '🌀',
    title: 'Komplexe Wirklichkeit',
    subtitle: 'Neopolis navigiert zwischen Kontrolle und Macht',
    text: 'Deine Entscheidungen haben Neopolis geprägt – mit Licht und Schatten. KI ist weder vollständig gezähmt noch außer Kontrolle. Die Stadt kämpft weiter darum, die richtige Balance zu finden. Das ist vielleicht die ehrlichste Antwort: Ethische KI-Gestaltung ist kein Endzustand, sondern ein dauerhafter Prozess.',
    color: '#9e9e9e',
    reflexion:
      'Verantwortungsvolle KI-Gestaltung ist keine einmalige Entscheidung, sondern eine dauerhafte demokratische Aufgabe – theologisch fundiert durch die Maßstäbe von Würde, Frieden, Gerechtigkeit und Schöpfung.',
  },
];
