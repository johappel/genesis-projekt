import type { Role } from '../types.js';

export const ROLES: Role[] = [
  {
    id: 'theologin',
    icon: '✝️',
    name: 'Theolog:in / Religionspädagog:in',
    perspective: 'Menschenbild, Berufung, Schöpfungsverantwortung',
    abilityDescription:
      'Sonderfähigkeit: Kann einmal pro Fall eine „Tiefenfrage" stellen, die versteckte anthropologische Risiken sichtbar macht.',
    desc: 'Du bringst theologische Kategorien in die Debatte: Was sagt eine KI-Entscheidung über das Menschenbild aus?',
  },
  {
    id: 'entwicklerin',
    icon: '💻',
    name: 'KI-Entwickler:in',
    perspective: 'Technik, Daten, Machbarkeit, Systemrisiken',
    abilityDescription: 'Sonderfähigkeit: Kann einmal technische Zusatzinfos zu einem Fall aufdecken.',
    desc: 'Du kennst die technischen Möglichkeiten und Grenzen. Du siehst, wie Algorithmen wirklich funktionieren.',
  },
  {
    id: 'juristin',
    icon: '⚖️',
    name: 'Jurist:in / Politiker:in',
    perspective: 'Rechte, Haftung, Regulierung, Gemeinwohl',
    abilityDescription: 'Sonderfähigkeit: Regulierungsoptionen kosten einmalig keinen Friedenspunkt.',
    desc: 'Du denkst in Gesetzen und Rechten. Du weißt: Ohne Regulierung gibt es keine Verantwortung.',
  },
  {
    id: 'sozialarbeiterin',
    icon: '🤝',
    name: 'Sozialarbeiter:in / Pädagog:in',
    perspective: 'Betroffene, Bildung, soziale Ungleichheit, Diskriminierung',
    abilityDescription:
      'Sonderfähigkeit: Erkennt in jedem Fall sofort, welche Gruppe besonders betroffen ist.',
    desc: 'Du siehst die Menschen hinter den Daten. Du hörst, wen KI-Systeme vergessen oder benachteiligen.',
  },
  {
    id: 'buergerin',
    icon: '🗣️',
    name: 'Bürger:innenvertretung / Jugendstimme',
    perspective: 'Alltagserfahrungen, Zusammenhalt, Freiheit, Zukunft',
    abilityDescription:
      'Sonderfähigkeit: Kann einmal die öffentliche Reaktion vorhersagen (+/- Friedenseffekt verdoppelt).',
    desc: 'Du sprichst für die Menschen der Stadt. Sozialer Zusammenhalt ist deine wichtigste Ressource.',
  },
  {
    id: 'prophetin',
    icon: '🔥',
    name: 'Prophetische Stimme',
    perspective: 'Kritik an Macht, Schutz der Schwachen, Zukunftswarnung',
    abilityDescription:
      'Sonderfähigkeit: Kann einmal im Spiel eine Entscheidung stoppen und eine Neuberatung erzwingen.',
    desc: 'Du warnst, bevor andere sehen. Du stehst für die, die keine Stimme haben. Du fragst: Wohin führt dieser Weg?',
  },
];
