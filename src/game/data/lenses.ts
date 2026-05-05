import type { Lens } from '../types.js';

export const LENSES: Lens[] = [
  {
    id: 'werkzeug',
    icon: '🔧',
    name: 'KI als Werkzeug',
    leitfrage: 'Wer handelt – und wer trägt Verantwortung?',
    desc: 'instrumentum hominis',
  },
  {
    id: 'dialog',
    icon: '💬',
    name: 'KI als Dialogpartner?',
    leitfrage: 'Behandeln Menschen KI wie ein Gegenüber?',
    desc: 'Buber: Ich-Du / Ich-Es',
  },
  {
    id: 'aktant',
    icon: '🕸️',
    name: 'KI als Aktant',
    leitfrage: 'Wie verändert KI das Netzwerk?',
    desc: 'Akteur-Netzwerk-Theorie',
  },
  {
    id: 'macht',
    icon: '⚡',
    name: 'KI als Machtform',
    leitfrage: 'Wo normiert oder beherrscht KI Menschen?',
    desc: 'Mächte & Gewalten / Biopolitik',
  },
  {
    id: 'trias',
    icon: '☮️',
    name: 'Frieden · Gerechtigkeit · Schöpfung',
    leitfrage: 'Dient KI der Trias?',
    desc: 'Konziliarer Prozess (ÖRK)',
  },
];
