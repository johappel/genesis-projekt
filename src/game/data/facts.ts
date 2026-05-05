import type { FactNote } from '../types.js';

/**
 * Fakten- und Quellenregister für Projekt Genesis.
 *
 * status:
 *   'fictional'     – Narratives Spielelement, kein realer Anspruch
 *   'needs-source'  – Reale Behauptung ohne Quellenbeleg
 *   'sourced'       – Mit Quelle belegt
 */
export const FACTS: FactNote[] = [
  {
    id: 'fact-01',
    claim:
      'KI-gestütztes individualisiertes Lernen kann messbare Leistungsgewinne erzielen.',
    status: 'needs-source',
    notes:
      'Die im Spiel genannten 18% Notenverbesserung sind fiktiv. Studien zeigen gemischte Ergebnisse. Quellen nachtragen.',
  },
  {
    id: 'fact-02',
    claim:
      'Automatisierte Diagnosesysteme können seltene Erkrankungen erkennen, die menschlichen Ärzt:innen entgehen.',
    status: 'needs-source',
    notes: 'Belege durch klinische Studien vorhanden, genaue Quellen noch einzutragen.',
  },
  {
    id: 'fact-03',
    claim:
      'Prädiktive Polizei-Algorithmen können strukturelle Diskriminierung verstärken.',
    status: 'needs-source',
    notes:
      'Vgl. Debatte um PredPol und ähnliche Systeme in den USA. Quellen zu europäischen Kontext nachtragen.',
  },
  {
    id: 'fact-04',
    claim:
      'SOPHIA, AEGIS und PAX sind fiktive KI-Systeme in der fiktiven Stadt Neopolis 2040.',
    status: 'fictional',
  },
  {
    id: 'fact-05',
    claim:
      'Konziliarer Prozess für Frieden, Gerechtigkeit und Bewahrung der Schöpfung (ÖRK, 1983).',
    status: 'sourced',
    sourceLabel: 'Ökumenischer Rat der Kirchen, Vancouver 1983',
    sourceUrl: 'https://www.oikoumene.org/resources/documents/peace-justice-and-integrity-of-creation',
  },
  {
    id: 'fact-06',
    claim: 'Paulus: archai kai exousiai – Mächte und Gewalten (Röm 8,38; Eph 6,12).',
    status: 'sourced',
    sourceLabel: 'Bibel (NT)',
    notes: 'Theologische Interpretation als Rahmung, keine empirische Behauptung.',
  },
  {
    id: 'fact-07',
    claim: 'Michel Foucault: Konzept der Biopolitik.',
    status: 'sourced',
    sourceLabel: 'Foucault, M.: Überwachen und Strafen (1975); Der Wille zum Wissen (1976)',
    notes: 'Theologische und ethische Anwendung auf KI ist interpretatorisch.',
  },
  {
    id: 'fact-08',
    claim: 'Martin Buber: Ich-Du / Ich-Es – Dialogphilosophie.',
    status: 'sourced',
    sourceLabel: 'Buber, M.: Ich und Du (1923)',
  },
  {
    id: 'fact-09',
    claim: 'Akteur-Netzwerk-Theorie nach Bruno Latour.',
    status: 'sourced',
    sourceLabel: 'Latour, B.: Eine neue Soziologie für eine neue Gesellschaft (2007)',
  },
];
