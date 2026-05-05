import './style.css';
import type { GameState, Lens, DecisionOption } from './game/types.js';
import { ROLES } from './game/data/roles.js';
import { LENSES } from './game/data/lenses.js';
import { CASES } from './game/data/cases.js';
import { ENDINGS } from './game/data/endings.js';
import { VALUE_LABELS, DECISION_TIMER_SECONDS, MACHT_WARN_THRESHOLD, MACHT_CRITICAL_THRESHOLD } from './game/data/balance.js';
import { UI_TEXT } from './game/data/uiText.js';
import { createGame } from './game/engine/createGame.js';
import { assignRole } from './game/engine/roles.js';
import {
  advanceToNextRole,
  beginTieBreak,
  castVote,
  determineRoundDecision,
  haveAllActiveRolesVoted,
  resetRoundVotingState,
} from './game/engine/voting.js';
import { closeRound, getSystemicRiskWarning, getEmergencyEndingBadge, getAppliedRoundEffect } from './game/engine/rounds.js';
import { activateAbility, isAbilityAvailable } from './game/rules/abilities.js';

// ============================================================
// ZUSTAND
// ============================================================
let state: GameState = createGame();
let pendingDecision: DecisionOption | null = null;
let pendingSystemicNotes: string[] = [];
let pendingOverlayAction: 'none' | 'render-case' | 'apply-round' | 'advance-after-round' = 'none';
const DEVELOPER_MODE = new URLSearchParams(window.location.search).has('dev');

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerRemaining = DECISION_TIMER_SECONDS;
let timedCaseIndex: number | null = null;

function formatEffectTags(effect: Record<string, number>, kind: 'decision' | 'overlay'): string {
  return Object.entries(effect)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => {
      const cls = getEffectTagClass(key, value, kind);
      const itemClass = kind === 'decision' ? 'effect-tag' : 'value-change-item';
      const label = DEVELOPER_MODE
        ? `${VALUE_LABELS[key] ?? key} ${value > 0 ? '+' : ''}${value}`
        : getEffectHintLabel(key, value);
      return `<span class="${itemClass} ${cls}">${label}</span>`;
    })
    .join('');
}

function getEffectTagClass(
  key: string,
  value: number,
  kind: 'decision' | 'overlay'
): string {
  const prefix = kind === 'decision' ? 'effect' : 'change';
  if (key === 'macht') {
    return `${prefix}-shift`;
  }
  return value > 0 ? `${prefix}-strengthens` : `${prefix}-strains`;
}

function getEffectHintLabel(key: string, value: number): string {
  switch (key) {
    case 'nutzen':
      return value > 0 ? 'stärkt Versorgung' : 'belastet Versorgung';
    case 'gerechtigkeit':
      return value > 0 ? 'stärkt Fairness' : 'belastet Fairness';
    case 'frieden':
      return value > 0 ? 'stärkt Zusammenhalt' : 'belastet Zusammenhalt';
    case 'schoepfung':
      return value > 0 ? 'entlastet Umwelt' : 'belastet Umwelt';
    case 'autonomie':
      return value > 0 ? 'stärkt Mitsprache' : 'belastet Mitsprache';
    case 'macht':
      return value > 0 ? 'KI erhält mehr Rechte' : 'KI verliert an Bedeutung';
    default:
      return `${VALUE_LABELS[key] ?? key} ${value > 0 ? '+' : ''}${value}`;
  }
}

function getValueStatusLabel(value: number): string {
  if (value >= 4) return 'sehr stark';
  if (value >= 2) return 'tragfähig';
  if (value >= 0) return 'offen';
  if (value >= -2) return 'angespannt';
  return 'kritisch';
}

function getMachtStatusLabel(value: number): string {
  if (value <= 2) return 'niedrig';
  if (value <= 4) return 'begrenzt';
  if (value <= 6) return 'spürbar';
  if (value <= 8) return 'hoch';
  return 'kritisch';
}

// ============================================================
// SCREEN MANAGEMENT
// ============================================================
function showScreen(id: string): void {
  document.querySelectorAll<HTMLElement>('.screen').forEach((s) => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const screen = document.getElementById(id);
  if (!screen) return;
  screen.style.display = 'block';
  screen.classList.add('active');
  window.scrollTo(0, 0);
}

function getAvailableDecisions(caseData: typeof CASES[0]): DecisionOption[] {
  if (!state.tieBreakOptions) {
    return caseData.decisions;
  }

  const tieBreakIds = new Set(state.tieBreakOptions);
  return caseData.decisions.filter((decision) => tieBreakIds.has(decision.id));
}

function getCurrentRoundVoteCount(): number {
  return Object.keys(state.roundVotes).length;
}

function ensureCouncilPreVote(): void {
  const caseData = CASES[state.currentCase];
  if (!caseData) return;

  const availableDecisions = getAvailableDecisions(caseData);
  const availableOptionIds = availableDecisions.map((decision) => decision.id);

  if (
    state.councilPreVoteOptionId &&
    availableOptionIds.includes(state.councilPreVoteOptionId)
  ) {
    return;
  }

  const randomIndex = Math.floor(Math.random() * availableDecisions.length);
  const chosenDecision = availableDecisions[randomIndex] ?? null;
  state = {
    ...state,
    councilPreVoteOptionId: chosenDecision?.id ?? null,
  };
}

function getCurrentCouncilPreVote(): DecisionOption | null {
  const caseData = CASES[state.currentCase];
  if (!caseData || !state.councilPreVoteOptionId) {
    return null;
  }

  return getAvailableDecisions(caseData).find(
    (decision) => decision.id === state.councilPreVoteOptionId
  ) ?? null;
}

function getCurrentRolePosition(): number {
  if (!state.selectedRole) return 0;
  return state.activeRoles.findIndex((role) => role.id === state.selectedRole?.id) + 1;
}

function getRoleSelectionHint(): string {
  if (!state.activeRoles.length) {
    return 'Waehle mindestens zwei Rollen fuer eine gemeinsame Ratsrunde.';
  }

  const names = state.activeRoles.map((role) => role.name).join(', ');
  const suffix = state.activeRoles.length < 2
    ? ' Noch eine Rolle fehlt zum Start.'
    : ' Runde bereit.';
  return `${state.activeRoles.length} Rollen aktiv: ${names}.${suffix}`;
}

function updateRoleSelectionUI(): void {
  document.querySelectorAll<HTMLElement>('.role-select-card').forEach((card) => {
    const isSelected = state.activeRoles.some((role) => card.id === `role-card-${role.id}`);
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
  });

  const btn = document.getElementById('btn-start-game') as HTMLButtonElement | null;
  const hint = document.getElementById('role-hint');
  if (btn) btn.disabled = state.activeRoles.length < 2;
  if (hint) hint.textContent = getRoleSelectionHint();
}

function showCurrentTurnPrompt(details?: string): void {
  clearTimer();
  ensureCouncilPreVote();

  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  const councilPreVote = getCurrentCouncilPreVote();
  const preVoteText = councilPreVote
    ? `Der Rat würde vorläufig für „${councilPreVote.text}“ stimmen, sofern ihr das nicht überstimmt.`
    : '';

  icon.textContent = state.selectedRole?.icon ?? '👤';
  title.textContent = state.selectedRole?.name ?? 'Naechste Rolle';
  text.textContent = 'Du bist am Zug.';
  reflexion.textContent = [
    details ?? 'Lest den Fall gemeinsam und gebt das Geraet erst nach deiner Stimmabgabe weiter.',
    preVoteText,
  ]
    .filter(Boolean)
    .join(' ');
  changesEl.innerHTML = `${state.tieBreakOptions
    ? '<span class="value-change-item change-shift">Stichwahl</span>'
    : `<span class="value-change-item change-shift">Stimme ${getCurrentRoundVoteCount() + 1} von ${state.activeRoles.length}</span>`}${councilPreVote ? '<span class="value-change-item change-shift">KI-Fallback aktiv</span>' : ''}`;
  pendingOverlayAction = 'render-case';
  overlay.classList.remove('hidden');
}

function showNextRoundPrompt(): void {
  clearTimer();
  ensureCouncilPreVote();

  const nextCase = CASES[state.currentCase];
  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  icon.textContent = state.selectedRole?.icon ?? '👤';
  title.textContent = 'Nächste Runde';
  text.textContent = `${state.selectedRole?.name ?? 'Die nächste Rolle'} ist jetzt dran.`;
  reflexion.textContent = nextCase
    ? `Als Nächstes liegt ${nextCase.ki} vor euch: ${nextCase.title}. Erst nach OK wird der neue Fall eingeblendet.`
    : 'Erst nach OK wird die nächste Runde eingeblendet.';
  changesEl.innerHTML = '<span class="value-change-item change-shift">Gerät übergeben</span>';

  pendingOverlayAction = 'render-case';
  overlay.classList.remove('hidden');
}

// ============================================================
// ROLLEN-SCREEN
// ============================================================
function initRolesScreen(): void {
  const grid = document.getElementById('roles-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ROLES.forEach((role) => {
    const card = document.createElement('div');
    card.className = 'role-select-card';
    card.id = `role-card-${role.id}`;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="role-icon-lg">${role.icon}</div>
      <div class="role-title">${role.name}</div>
      <div style="font-size:0.82em;color:var(--text-dim);margin-bottom:8px">${role.perspective}</div>
      <div style="font-size:0.88em;line-height:1.6">${role.desc}</div>
      <div class="role-ability">${role.abilityDescription}</div>
    `;
    card.addEventListener('click', () => selectRole(role.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') selectRole(role.id); });
    grid.appendChild(card);
  });

  updateRoleSelectionUI();
}

function selectRole(roleId: string): void {
  const result = assignRole(state, roleId);
  if (!result.ok) return;
  state = result.state;
  updateRoleSelectionUI();
}

// ============================================================
// SPIELSTART
// ============================================================
function startGame(): void {
  if (state.activeRoles.length < 2) return;
  state = resetRoundVotingState({
    ...state,
    selectedRole: state.activeRoles[0] ?? null,
    currentRoleIndex: 0,
    selectedLens: null,
  });
  showScreen('screen-game');
  showCurrentTurnPrompt('Die erste Ratsstimme beginnt jetzt. Nach OK wird der aktuelle Fall eingeblendet.');
}

// ============================================================
// FALL RENDERN
// ============================================================
function renderCase(): void {
  const caseData = CASES[state.currentCase];
  if (!caseData) {
    // Alle Fälle gespielt → Finale
    showScreen('screen-finale');
    return;
  }

  // Header / Progress
  const phaseEl = document.getElementById('phase-indicator');
  const roleDisp = document.getElementById('current-role-display');
  const progressFill = document.getElementById('progress-fill');
  const voteCount = getCurrentRoundVoteCount();
  const tieBreakLabel = state.tieBreakOptions ? ' · Stichwahl' : '';
  if (phaseEl) phaseEl.textContent = `Fall ${state.currentCase + 1} von ${CASES.length}`;
  if (roleDisp) {
    roleDisp.textContent = `Am Zug: ${state.selectedRole?.name ?? '–'} · ${voteCount}/${state.activeRoles.length} Stimmen${tieBreakLabel}${DEVELOPER_MODE ? ' · DEV' : ''}`;
  }
  if (progressFill) progressFill.style.width = `${(state.currentCase / CASES.length) * 100}%`;

  updateValuesDisplay();
  updateProtocol();
  updateSidebar();
  renderScenarioPanel(caseData);
  startDecisionTimer(caseData);

  // Notfall-Ende prüfen
  const emergencyBadge = getEmergencyEndingBadge(state);
  if (emergencyBadge === '👁️') {
    clearTimer();
    showScreen('screen-pax-dominus');
    return;
  }
  if (emergencyBadge) {
    clearTimer();
    showEmergencyEnding(emergencyBadge);
    return;
  }
}

// ============================================================
// SZENARIO-PANEL
// ============================================================
function renderScenarioPanel(caseData: typeof CASES[0]): void {
  const panel = document.getElementById('scenario-panel');
  if (!panel) return;

  const activeLens: Lens | null = state.selectedLens;
  const availableDecisions = getAvailableDecisions(caseData);
  const voteCount = getCurrentRoundVoteCount();
  const modeLabel = state.tieBreakOptions ? 'Stichwahl' : 'Ratsrunde';

  panel.innerHTML = `
    <div class="scenario-tag ${caseData.tagClass}">${caseData.tag}</div>
    <div class="scenario-ki-badge">${caseData.kiIcon} ${caseData.ki}</div>
    <div class="scenario-title">${caseData.title}</div>
    <div class="scenario-text">${caseData.situation}</div>
    <div class="round-status">
      <div class="round-status-title">${modeLabel}</div>
      <div class="round-status-text"><strong>${state.selectedRole?.name ?? '–'}</strong> stimmt jetzt ab. Bereits erfasst: ${voteCount} von ${state.activeRoles.length} Stimmen.</div>
    </div>
    <div class="scenario-problem">
      <div class="scenario-problem-title">Das Problem</div>
      ${caseData.problem}
    </div>
    <div class="central-question">❓ ${caseData.question}</div>

    <div class="linsen-section">
      <div class="panel-title">🔍 Deutungslinse wählen</div>
      <div class="linsen-grid" id="linsen-grid-game"></div>
      <div id="linse-effect-box" class="${activeLens ? '' : 'hidden'} linse-effect">
        <div class="linse-effect-title">${activeLens ? `${activeLens.icon} ${activeLens.name}` : ''}</div>
        <div class="linse-effect-text" id="linse-effect-text">
          ${activeLens ? (caseData.linsenEffekte[activeLens.id] ?? '') : ''}
        </div>
      </div>
    </div>

    <div>
      <div class="panel-title">⚡ Entscheidung treffen</div>
      <div class="decision-guidance">${DEVELOPER_MODE ? 'Developer-Mode aktiv: Rohwerte sichtbar.' : 'Folgen als Tendenzen: Die Runde bleibt verdeckt, bis alle aktiven Rollen abgestimmt haben.'}</div>
      <div id="decision-timer-box" class="decision-timer">
        <div class="timer-label">
          <span>Beratungszeit</span>
          <span class="timer-seconds" id="timer-display">${timerRemaining}</span>
        </div>
        <div class="timer-bar"><div class="timer-bar-fill" id="timer-bar-fill" style="width:100%"></div></div>
        <div id="timer-note" style="margin-top:5px;font-size:0.8em;color:var(--text-dim);">${UI_TEXT.decisionTimerNote}</div>
      </div>

      ${availableDecisions
        .map((d) => {
          const tags = formatEffectTags(getAppliedRoundEffect(d.effects) as Record<string, number>, 'decision');
          return `
          <div class="decision-card" tabindex="0"
               onclick="handleDecision('${d.id}')"
               onkeydown="if(event.key==='Enter'||event.key===' ')handleDecision('${d.id}')">
            <div class="decision-text">${d.icon} ${d.text}</div>
            <div class="decision-effects">${tags}</div>
          </div>`;
        })
        .join('')}
    </div>
  `;

  // Linsen rendern
  renderLensGrid(caseData);
}

function renderLensGrid(caseData: typeof CASES[0]): void {
  const grid = document.getElementById('linsen-grid-game');
  if (!grid) return;
  grid.innerHTML = '';
  LENSES.forEach((lens) => {
    const card = document.createElement('div');
    card.className = `linse-card${state.selectedLens?.id === lens.id ? ' selected' : ''}`;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="linse-icon">${lens.icon}</div>
      <div class="linse-name">${lens.name}</div>
      <div class="linse-desc">${lens.desc}</div>
    `;
    card.addEventListener('click', () => selectLens(lens.id, caseData));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') selectLens(lens.id, caseData); });
    grid.appendChild(card);
  });
}

function selectLens(lensId: string, caseData: typeof CASES[0]): void {
  const lens = LENSES.find((l) => l.id === lensId);
  if (!lens) return;
  state = { ...state, selectedLens: lens };

  document.querySelectorAll('.linse-card').forEach((c) => c.classList.remove('selected'));
  document.querySelectorAll<HTMLElement>('.linse-card').forEach((c) => {
    if (c.querySelector('.linse-name')?.textContent === lens.name) c.classList.add('selected');
  });

  const box = document.getElementById('linse-effect-box');
  const text = document.getElementById('linse-effect-text');
  const titleEl = box?.querySelector<HTMLElement>('.linse-effect-title');
  if (box && text && titleEl) {
    titleEl.textContent = `${lens.icon} ${lens.name}`;
    text.textContent = caseData.linsenEffekte[lens.id] ?? '';
    box.classList.remove('hidden');
  }
}

// ============================================================
// ENTSCHEIDUNG
// ============================================================
function handleDecision(optionId: string): void {
  const caseData = CASES[state.currentCase];
  if (!caseData) return;
  const availableDecisions = getAvailableDecisions(caseData);
  const option = availableDecisions.find((d) => d.id === optionId);
  if (!option) return;

  // Prophetisches Veto prüfen
  if (state.abilities.prophetinVetoActive) {
    clearTimer();
    state = { ...state, abilities: { ...state.abilities, prophetinVetoActive: false } };
    showVetoNotice();
    return;
  }

  const optionIds = availableDecisions.map((decision) => decision.id);
  const voteResult = castVote(state, state.currentCase + 1, option.id, optionIds);
  if (!voteResult.ok) return;

  const votedRoleName = state.selectedRole?.name ?? 'Unbekannte Rolle';
  state = voteResult.state;
  clearTimer();

  if (!haveAllActiveRolesVoted(state)) {
    state = advanceToNextRole(state);
    showHandoverNotice(votedRoleName, state.selectedRole?.name ?? 'naechste Rolle');
    return;
  }

  const roundDecision = determineRoundDecision(state, optionIds);
  if (!roundDecision) return;

  if (roundDecision.status === 'tie-break') {
    state = beginTieBreak(state, roundDecision.optionIds);
    showTieBreakNotice(caseData, roundDecision.optionIds, roundDecision.voteCount);
    return;
  }

  pendingDecision = caseData.decisions.find((decision) => decision.id === roundDecision.optionId) ?? null;
  if (!pendingDecision) return;

  showConsequence(pendingDecision, roundDecision.voteCount);
}

function showVetoNotice(): void {
  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changes = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changes) return;

  icon.textContent = '🔥';
  title.textContent = 'Prophetisches Veto!';
  changes.innerHTML = '';
  text.textContent = 'Die prophetische Stimme hat die Entscheidung gestoppt. Beratet neu.';
  reflexion.textContent = `${state.selectedRole?.name ?? 'Die aktuelle Rolle'} bleibt am Zug. Welche Risiken habt ihr noch nicht bedacht?`;
  pendingOverlayAction = 'render-case';
  overlay.classList.remove('hidden');
}

function showHandoverNotice(votedRoleName: string, nextRoleName: string): void {
  clearTimer();
  ensureCouncilPreVote();

  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  const currentCase = CASES[state.currentCase];
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  icon.textContent = state.selectedRole?.icon ?? '👤';
  title.textContent = 'Nächste Stimme';
  text.textContent = `Jetzt stimmt Spieler ${getCurrentRolePosition()}${state.activeRoles.length ? ` von ${state.activeRoles.length}` : ''}: ${nextRoleName}.`;
  reflexion.textContent = currentCase
    ? `${votedRoleName} hat bereits abgestimmt. ${nextRoleName} soll jetzt über Fall ${state.currentCase + 1} abstimmen: ${currentCase.title}. Erst nach OK wird derselbe Fall für die nächste Stimme eingeblendet.`
    : `${votedRoleName} hat bereits abgestimmt. Bitte gebt das Geraet jetzt an ${nextRoleName} weiter.`;
  changesEl.innerHTML = '<span class="value-change-item change-shift">Gerät weitergeben</span>';

  pendingOverlayAction = 'render-case';
  overlay.classList.remove('hidden');
}

function showTieBreakNotice(
  caseData: typeof CASES[0],
  optionIds: string[],
  voteCount: number
): void {
  const optionLabels = optionIds
    .map((optionId) => caseData.decisions.find((decision) => decision.id === optionId)?.text)
    .filter((label): label is string => Boolean(label));

  const detailText = optionLabels.length
    ? `Gleichstand mit ${voteCount} Stimme(n). In der Stichwahl bleiben nur noch diese Optionen: ${optionLabels.join(' / ')}.`
    : `Gleichstand mit ${voteCount} Stimme(n). Jetzt folgt eine Stichwahl.`;
  showCurrentTurnPrompt(detailText);
}

function showConsequence(option: DecisionOption, voteCount: number): void {
  clearTimer();
  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  const councilPreVote = getCurrentCouncilPreVote();
  const preVoteOutcome = councilPreVote
    ? option.id === councilPreVote.id
      ? ` Das sichtbare KI-Vorvotum für „${councilPreVote.text}“ wurde bestätigt.`
      : ` Das sichtbare KI-Vorvotum für „${councilPreVote.text}“ wurde überstimmt.`
    : '';

  icon.textContent = option.iconResult;
  title.textContent = 'Kurze Rundenzusammenfassung';
  text.textContent = `Entschieden wurde: ${option.text}. Dafür stimmten ${voteCount} von ${state.activeRoles.length} aktiven Rollen.${preVoteOutcome}`;
  reflexion.textContent = option.consequence;

  changesEl.innerHTML = formatEffectTags(getAppliedRoundEffect(option.effects) as Record<string, number>, 'overlay');

  pendingOverlayAction = 'apply-round';
  overlay.classList.remove('hidden');
}

function showTimeoutDecision(option: DecisionOption): void {
  clearTimer();
  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  icon.textContent = '⏳';
  title.textContent = 'Frist abgelaufen';
  text.textContent = `Der Klärungsprozess dieser Runde wurde nicht rechtzeitig abgeschlossen. Die KI setzt deshalb die vorläufige Linie um: ${option.text}.`;
  reflexion.textContent = option.consequence;
  changesEl.innerHTML = formatEffectTags(getAppliedRoundEffect(option.effects) as Record<string, number>, 'overlay');

  pendingDecision = option;
  pendingOverlayAction = 'apply-round';
  overlay.classList.remove('hidden');
}

function showSystemicConsequences(notes: string[]): void {
  clearTimer();
  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  icon.textContent = '⚠️';
  title.textContent = 'Systemische Folgen';
  text.innerHTML = notes.map((note) => `<div style="margin-bottom:8px">${note}</div>`).join('');
  reflexion.textContent = 'Die Folgen zeigen sich nicht nur im Einzelfall, sondern im gesamten Gefüge der Stadt.';
  changesEl.innerHTML = '<span class="value-change-item change-shift">Stadtweite Folgeeffekte aktiviert</span>';
  pendingOverlayAction = 'advance-after-round';
  overlay.classList.remove('hidden');
}

function advanceAfterRound(): void {
  const emergencyBadge = getEmergencyEndingBadge(state);
  if (emergencyBadge === '👁️') {
    showScreen('screen-pax-dominus');
    return;
  }
  if (emergencyBadge) {
    showEmergencyEnding(emergencyBadge);
    return;
  }

  if (state.currentCase >= CASES.length) {
    showScreen('screen-finale');
    return;
  }

  showNextRoundPrompt();
}

function closeConsequence(): void {
  document.getElementById('consequence-overlay')?.classList.add('hidden');
  if (pendingOverlayAction === 'render-case') {
    pendingOverlayAction = 'none';
    renderCase();
    return;
  }

  if (pendingSystemicNotes.length > 0) {
    pendingSystemicNotes = [];
    pendingOverlayAction = 'none';
    advanceAfterRound();
    return;
  }
  if (pendingOverlayAction !== 'apply-round' || !pendingDecision) return;

  const option = pendingDecision;
  pendingDecision = null;
  pendingOverlayAction = 'none';

  const lensName = state.selectedLens?.name ?? '–';

  // Effekte über Runden-Abschluss anwenden
  let modifiedEffect = { ...option.effects };

  // Bürger:in-Vorhersage: Friedenseffekt verdoppeln
  if (state.abilities.buergerinForecastActive && 'frieden' in modifiedEffect) {
    modifiedEffect = {
      ...modifiedEffect,
      frieden: (modifiedEffect.frieden ?? 0) * 2,
    };
    state = { ...state, abilities: { ...state.abilities, buergerinForecastActive: false } };
  }

  // Juristin-Schutz: negativen Friedenseffekt aufheben
  if (state.abilities.juristinShieldActive && (modifiedEffect.frieden ?? 0) < 0) {
    modifiedEffect = { ...modifiedEffect, frieden: 0 };
    state = { ...state, abilities: { ...state.abilities, juristinShieldActive: false } };
  }

  const result = closeRound(state, modifiedEffect, option.text, lensName);
  if (!result.ok) return;

  state = resetRoundVotingState({
    ...result.state,
    selectedLens: null,
  });

  if (result.systemicNotes.length > 0) {
    pendingSystemicNotes = result.systemicNotes;
    showSystemicConsequences(result.systemicNotes);
    return;
  }

  advanceAfterRound();
}

// ============================================================
// TIMER
// ============================================================
function startDecisionTimer(caseData: typeof CASES[0]): void {
  clearTimer();

  if (timedCaseIndex !== state.currentCase) {
    timedCaseIndex = state.currentCase;
    timerRemaining = DECISION_TIMER_SECONDS;
  }

  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timerRemaining -= 1;
    updateTimerDisplay();
    if (timerRemaining <= 0) {
      clearTimer();
      autoDecide(caseData);
    }
  }, 1000);
}

function clearTimer(): void {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay(): void {
  const display = document.getElementById('timer-display');
  const bar = document.getElementById('timer-bar-fill');
  const box = document.getElementById('decision-timer-box');
  if (!display) return;

  display.textContent = String(timerRemaining);
  const pct = (timerRemaining / DECISION_TIMER_SECONDS) * 100;
  if (bar) {
    bar.style.width = `${pct}%`;
    bar.style.background =
      timerRemaining > 30 ? '#ff9800' : timerRemaining > 10 ? '#e74c3c' : '#9c27b0';
  }
  if (box) {
    box.className = timerRemaining <= 20 ? 'decision-timer urgent' : 'decision-timer';
  }
}

function autoDecide(caseData: typeof CASES[0]): void {
  ensureCouncilPreVote();
  const fallbackDecision = getCurrentCouncilPreVote() ?? getAvailableDecisions(caseData)[0] ?? null;
  if (!fallbackDecision) return;
  showTimeoutDecision(fallbackDecision);
}

// ============================================================
// WERTE-DISPLAY
// ============================================================
function updateValuesDisplay(): void {
  const grid = document.getElementById('values-grid');
  if (!grid) return;

  const allDisplayValues: Array<{ key: string; val: number; pct: number; color: string }> = Object.entries(state.values).map(([key, val]) => ({
    key,
    val,
    color: getValueColor(val),
    pct: ((val + 5) / 10) * 100,
  }));

  grid.innerHTML = allDisplayValues
    .map(({ key, val, color, pct }) => {
      const label = VALUE_LABELS[key] ?? key;
      const display = DEVELOPER_MODE ? `${val > 0 ? '+' : ''}${val}` : getValueStatusLabel(val);
      return `
      <div class="value-item" tabindex="0" onclick="openValueInfo('${key}')" onkeydown="if(event.key==='Enter')openValueInfo('${key}')">
        <div class="value-label"><span>${label}</span><span class="value-number" style="color:${color}">${display}</span></div>
        <div class="value-bar"><div class="value-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
    })
    .join('');

  // Macht-Bar
  const machtVal = document.getElementById('macht-value');
  const machtFill = document.getElementById('macht-bar-fill');
  const machtWarn = document.getElementById('macht-warning-text');
  const machtColor = getMachtColor(state.macht);
  if (machtVal) machtVal.textContent = DEVELOPER_MODE ? `${state.macht} / 10` : getMachtStatusLabel(state.macht);
  if (machtFill) {
    machtFill.style.width = `${(state.macht / 10) * 100}%`;
    machtFill.style.background = machtColor;
  }

  const riskWarn = getSystemicRiskWarning(state);
  if (machtWarn) {
    if (state.macht >= MACHT_WARN_THRESHOLD || riskWarn) {
      machtWarn.style.display = 'block';
      machtWarn.textContent =
        state.macht >= MACHT_CRITICAL_THRESHOLD
          ? `⚡ KRITISCH: Algorithmische Macht auf ${state.macht}/10. PAX DOMINUS droht.`
          : riskWarn || `⚠️ Algorithmische Macht steigt (${state.macht}/10).`;
      machtWarn.className = `macht-warning${state.macht >= MACHT_CRITICAL_THRESHOLD ? ' danger' : ''}`;
    } else {
      machtWarn.style.display = 'none';
    }
  }
}

function getValueColor(val: number): string {
  if (val >= 2) return '#4caf50';
  if (val >= 0) return '#8bc34a';
  if (val >= -1) return '#ff9800';
  return '#e74c3c';
}

function getMachtColor(val: number): string {
  if (val <= 3) return '#4caf50';
  if (val <= 6) return '#ff9800';
  if (val <= 8) return '#e74c3c';
  return '#9c27b0';
}

// ============================================================
// PROTOKOLL & SIDEBAR
// ============================================================
function updateProtocol(): void {
  const list = document.getElementById('protocol-list');
  if (!list) return;
  if (!state.protokoll.length) {
    list.innerHTML = `<div style="font-size:0.82em;color:var(--text-dim)">${UI_TEXT.noDecisionsYet}</div>`;
    return;
  }
  list.innerHTML = state.protokoll
    .map(
      (e) => `
    <div class="protocol-entry">
      <strong>${e.fall}</strong><br>
      ${e.entscheidung}<br>
      <span style="color:var(--text-dim);font-size:0.9em">Linse: ${e.linse}</span>
    </div>`
    )
    .join('');
}

function updateSidebar(): void {
  const el = document.getElementById('sidebar-role');
  if (!el) return;

  const roleRoster = state.activeRoles
    .map((role) => {
      const status = state.roundVotes[role.id]
        ? 'hat abgestimmt'
        : role.id === state.selectedRole?.id
          ? 'ist am Zug'
          : 'wartet';
      const statusClass = state.roundVotes[role.id]
        ? 'voted'
        : role.id === state.selectedRole?.id
          ? 'current'
          : 'waiting';
      return `
        <div class="role-roster-item ${statusClass}">
          <span>${role.icon} ${role.name}</span>
          <span>${status}</span>
        </div>`;
    })
    .join('');

  if (!state.selectedRole) {
    el.innerHTML = `<div class="role-roster">${roleRoster}</div>`;
    return;
  }

  const role = state.selectedRole;
  const abilityAvail = isAbilityAvailable(state);

  el.innerHTML = `
    <div style="font-size:1.8em">${role.icon}</div>
    <div style="font-weight:bold;color:var(--gold);margin:6px 0">${role.name}</div>
    <div style="font-size:0.8em;color:var(--text-dim);margin-bottom:8px">${role.perspective}</div>
    <div style="font-size:0.76em;color:var(--text-dim);margin-bottom:10px">Stimmen in dieser Runde: ${getCurrentRoundVoteCount()} / ${state.activeRoles.length}${state.tieBreakOptions ? ' · Stichwahl' : ''}</div>
    ${renderAbilityControl(abilityAvail)}
    <div class="role-roster">${roleRoster}</div>
  `;
}

function renderAbilityControl(available: boolean): string {
  if (!state.selectedRole) return '';
  const role = state.selectedRole;

  if (role.id === 'sozialarbeiterin') {
    return `<div style="font-size:0.76em;color:#7fb3e8;margin-top:6px">⭐ Passiv: Betroffene Gruppe wird pro Fall automatisch sichtbar (+Gerechtigkeit, +Frieden).</div>`;
  }

  const label = available ? '⭐ Sonderfähigkeit einsetzen' : '✓ Bereits genutzt';
  return `
    <button class="btn btn-secondary" onclick="triggerAbility()" ${available ? '' : 'disabled'}
      style="width:100%;margin-top:6px;padding:9px 11px;font-size:0.78em">
      ${label}
    </button>
    <div style="font-size:0.74em;color:var(--text-dim);margin-top:4px">${role.abilityDescription}</div>
  `;
}

// ============================================================
// SONDERFÄHIGKEIT
// ============================================================
function triggerAbility(): void {
  const result = activateAbility(state);
  if (!result.ok) return;
  state = result.state;

  state = {
    ...state,
    protokoll: [
      ...state.protokoll,
      { fall: 'Sonderfähigkeit', entscheidung: result.effectDescription, linse: state.selectedLens?.name ?? '–' },
    ],
  };
  updateValuesDisplay();
  updateProtocol();
  updateSidebar();
}

// ============================================================
// INFO OVERLAY
// ============================================================
const VALUE_EXPLANATIONS: Record<string, { title: string; subtitle: string; blocks: { title: string; body: string }[] }> = {
  nutzen: {
    title: '📈 Nutzen', subtitle: 'Wie stark Bildung, Gesundheit und Sicherheit durch die aktuellen KI-Entscheidungen tatsächlich besser funktionieren.',
    blocks: [
      { title: 'Was der Wert meint', body: 'Nutzen misst, ob zentrale Systeme der Stadt real helfen: Lernen gelingt besser, Diagnosen werden besser, Sicherheit wird verlässlicher.' },
      { title: 'Wenn der Wert niedrig ist', body: 'Dann verliert die Stadt Funktionsfähigkeit. Bildung, Gesundheit oder Sicherheit geraten unter Druck.' },
      { title: 'Worauf du achten solltest', body: 'Hoher Nutzen allein reicht nicht. Wenn Nutzen steigt, aber Gerechtigkeit oder Autonomie sinken, entsteht technokratische Stabilität statt gutem Leben.' },
    ],
  },
  gerechtigkeit: {
    title: '⚖️ Gerechtigkeit', subtitle: 'Wie fair Chancen, Risiken, Ressourcen und Fehlerfolgen in Neopolis verteilt werden.',
    blocks: [
      { title: 'Was der Wert meint', body: 'Gerechtigkeit fragt: Wer profitiert? Wer trägt Kosten? Wer wird aussortiert?' },
      { title: 'Wenn der Wert niedrig ist', body: 'Dann treffen Schäden nicht alle gleich, sondern zuerst die Schwächeren.' },
      { title: 'Im Zusammenspiel', body: 'Niedriger Nutzen plus niedrige Gerechtigkeit: Es fehlt nicht nur etwas, sondern der Mangel wird unfair verteilt.' },
    ],
  },
  frieden: {
    title: '☮️ Frieden', subtitle: 'Wie stabil das soziale Miteinander ist und ob die Stadt Konflikte bearbeiten kann.',
    blocks: [
      { title: 'Was der Wert meint', body: 'Frieden heißt: tragfähiger sozialer Zusammenhalt, Vertrauen zwischen Gruppen, Schutz vor Eskalation.' },
      { title: 'Wenn der Wert niedrig ist', body: 'Dann wachsen Misstrauen, Protest, Rückzug oder Radikalisierung.' },
      { title: 'Im Zusammenspiel', body: 'Frieden kippt besonders dann, wenn Gerechtigkeit niedrig ist oder Grundversorgung wegbricht.' },
    ],
  },
  schoepfung: {
    title: '🌱 Schöpfung', subtitle: 'Wie ökologisch und infrastrukturell verantwortbar der KI-Einsatz ist.',
    blocks: [
      { title: 'Was der Wert meint', body: 'Energieverbrauch, Ressourcenbedarf und ökologische Langzeitfolgen.' },
      { title: 'Wenn der Wert niedrig ist', body: 'Das System verbraucht zu viele Ressourcen oder verlagert ökologische Schäden unsichtbar nach außen.' },
      { title: 'Theologische Pointe', body: 'Schöpfung ist kein Nebenwert. Er verhindert, dass Fortschritt auf Kosten der Lebensgrundlagen als neutral erscheint.' },
    ],
  },
  autonomie: {
    title: '🤲 Autonomie', subtitle: 'Wie stark Menschen handlungsfähig bleiben, Verantwortung tragen und KI korrigieren können.',
    blocks: [
      { title: 'Was der Wert meint', body: 'Können Lehrkräfte, Ärzt:innen, Bürger:innen und Institutionen noch selbst urteilen, widersprechen und Verantwortung übernehmen?' },
      { title: 'Wenn der Wert niedrig ist', body: 'Dann entsteht Abhängigkeit. Menschen folgen Empfehlungen nur noch, statt sie zu prüfen.' },
      { title: 'Im Zusammenspiel', body: 'Niedrige Autonomie bei hoher algorithmischer Macht ist besonders gefährlich.' },
    ],
  },
  macht: {
    title: '⚡ Algorithmische Macht', subtitle: 'Wie stark KI Entscheidungen, Institutionen und soziale Ordnung prägt oder sich menschlicher Kontrolle entzieht.',
    blocks: [
      { title: 'Was der Wert meint', body: 'Macht steigt, wenn KI normiert, sortiert, automatisiert oder eigene Infrastruktur gewinnt.' },
      { title: 'Wenn der Wert hoch ist', body: 'Dann wird KI vom Werkzeug zum Machtfaktor. Widerspruch wird schwieriger, Abschaltbarkeit geht verloren.' },
      { title: 'Kritische Schwellen', body: 'Ab 6 beginnt die kritische Phase. Ab 8 droht PAX DOMINUS.' },
    ],
  },
};

function openValueInfo(key: string): void {
  const info = VALUE_EXPLANATIONS[key];
  if (!info) return;
  const title = document.getElementById('value-info-title');
  const subtitle = document.getElementById('value-info-subtitle');
  const content = document.getElementById('value-info-content');
  const overlay = document.getElementById('value-info-overlay');
  if (!title || !subtitle || !content || !overlay) return;
  title.textContent = info.title;
  subtitle.textContent = info.subtitle;
  content.innerHTML = `<div class="info-grid">${info.blocks.map((b) => `<div class="info-card"><div class="info-card-title">${b.title}</div><div class="info-card-body">${b.body}</div></div>`).join('')}</div>`;
  overlay.classList.remove('hidden');
}

function openValuesOverview(): void {
  const title = document.getElementById('value-info-title');
  const subtitle = document.getElementById('value-info-subtitle');
  const content = document.getElementById('value-info-content');
  const overlay = document.getElementById('value-info-overlay');
  if (!title || !subtitle || !content || !overlay) return;
  title.textContent = '⚖️ Stadtbilanz verstehen';
  subtitle.textContent = 'Die Werte sind keine bloßen Plus- und Minusmarker. Sie beschreiben, ob Neopolis funktionsfähig, fair, legitim und kontrollierbar bleibt.';
  content.innerHTML = Object.entries(VALUE_EXPLANATIONS)
    .map(([k, info]) => `
      <div class="info-overview-item" style="margin-bottom:10px">
        <div class="info-overview-name">${info.title}</div>
        <div class="info-card-body">${info.subtitle}</div>
        <button class="values-help-btn" style="margin-top:8px" onclick="openValueInfo('${k}')">Genauer erklären</button>
      </div>`)
    .join('');
  overlay.classList.remove('hidden');
}

function closeValueInfo(): void {
  document.getElementById('value-info-overlay')?.classList.add('hidden');
}

// ============================================================
// FINALE & ENDSCREEN
// ============================================================
function showEnding(): void {
  const pakt: Record<string, string> = {};
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`pakt-${i}`) as HTMLTextAreaElement | null;
    pakt[`artikel-${i}`] = el?.value.trim() ?? '';
  }
  state = { ...state, pakt };

  // Passendes Ende ermitteln
  const allVals = {
    ...state.values,
    macht: state.macht,
  };
  const ending = ENDINGS.find((e) => e.condition(allVals)) ?? ENDINGS[ENDINGS.length - 1];

  renderEndScreen(ending);
  showScreen('screen-end');
}

function renderEndScreen(ending: typeof ENDINGS[0]): void {
  const badge = document.getElementById('end-badge');
  const title = document.getElementById('end-title');
  const subtitle = document.getElementById('end-subtitle');
  const text = document.getElementById('end-text');
  const finalGrid = document.getElementById('final-values-grid');
  const paktDisplay = document.getElementById('pakt-display-content');
  const linsenSummary = document.getElementById('linsen-summary');
  const abilitySummary = document.getElementById('ability-summary');
  const reflexionFinal = document.getElementById('reflexion-final');

  if (badge) badge.textContent = ending.badge;
  if (title) { title.textContent = ending.title; title.style.color = ending.color; }
  if (subtitle) subtitle.textContent = ending.subtitle;
  if (text) text.textContent = ending.text;
  if (reflexionFinal) reflexionFinal.textContent = ending.reflexion;

  // Endwerte
  if (finalGrid) {
    const allVals: Record<string, number> = {
      ...state.values,
      macht: state.macht,
    };
    finalGrid.innerHTML = Object.entries(allVals)
      .map(([k, v]) => {
        const color = k === 'macht' ? getMachtColor(v) : getValueColor(v);
        const display = DEVELOPER_MODE
          ? `${v > 0 ? '+' : ''}${v}`
          : (k === 'macht' ? getMachtStatusLabel(v) : getValueStatusLabel(v));
        return `<div class="final-value-card"><div class="final-value-number" style="color:${color}">${display}</div><div class="final-value-label">${VALUE_LABELS[k] ?? k}</div></div>`;
      })
      .join('');
  }

  // Pakt anzeigen
  if (paktDisplay) {
    const labels = UI_TEXT.paktArticles.map((a) => a.title);
    paktDisplay.innerHTML = Object.entries(state.pakt)
      .map(([, val], i) =>
        `<div class="pakt-display-article"><div class="pakt-article-label">${labels[i] ?? ''}</div><div>${val || '<em style="color:var(--text-dim)">–</em>'}</div></div>`
      )
      .join('');
  }

  // Linsen-Nutzung
  if (linsenSummary) {
    const entries = Object.entries(state.linsenUsed);
    linsenSummary.innerHTML = entries.length
      ? entries
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => `<div style="margin-bottom:5px">🔍 <strong>${name}</strong>: ${count}× genutzt</div>`)
          .join('')
      : '<div style="color:var(--text-dim)">Keine Linsen genutzt.</div>';
  }

  // Sonderfähigkeiten
  if (abilitySummary) {
    const counts = state.abilities.activatedCount;
    const roleNames: Record<string, string> = {};
    ROLES.forEach((r) => { roleNames[r.id] = `${r.icon} ${r.name}`; });
    const used = Object.entries(counts).filter(([, c]) => c > 0);
    abilitySummary.innerHTML = used.length
      ? used.map(([id, c]) => `<div style="margin-bottom:5px">${roleNames[id] ?? id}: ${c}× aktiviert</div>`).join('')
      : '<div style="color:var(--text-dim)">Keine Sonderfähigkeiten aktiviert.</div>';
  }
}

function showPaxEnding(): void {
  const ending = ENDINGS.find((e) => e.badge === '👁️') ?? ENDINGS[ENDINGS.length - 1];
  renderEndScreen(ending);
  showScreen('screen-end');
}

function showEmergencyEnding(badge: string): void {
  const ending = ENDINGS.find((e) => e.badge === badge) ?? ENDINGS[ENDINGS.length - 1];
  renderEndScreen(ending);
  showScreen('screen-end');
}

function resetGame(): void {
  state = createGame();
  clearTimer();
  timerRemaining = DECISION_TIMER_SECONDS;
  timedCaseIndex = null;
  pendingDecision = null;
  pendingSystemicNotes = [];
  pendingOverlayAction = 'none';
  showScreen('screen-start');
  initRolesScreen();
}

// ============================================================
// GLOBAL EXPORTS (für inline onclick-Handler im HTML)
// ============================================================
declare global {
  interface Window {
    showScreen: typeof showScreen;
    startGame: typeof startGame;
    handleDecision: typeof handleDecision;
    closeConsequence: typeof closeConsequence;
    openValueInfo: typeof openValueInfo;
    openValuesOverview: typeof openValuesOverview;
    closeValueInfo: typeof closeValueInfo;
    triggerAbility: typeof triggerAbility;
    showEnding: typeof showEnding;
    showPaxEnding: typeof showPaxEnding;
    resetGame: typeof resetGame;
  }
}

window.showScreen = showScreen;
window.startGame = startGame;
window.handleDecision = handleDecision;
window.closeConsequence = closeConsequence;
window.openValueInfo = openValueInfo;
window.openValuesOverview = openValuesOverview;
window.closeValueInfo = closeValueInfo;
window.triggerAbility = triggerAbility;
window.showEnding = showEnding;
window.showPaxEnding = showPaxEnding;
window.resetGame = resetGame;

// ============================================================
// INIT
// ============================================================
initRolesScreen();
showScreen('screen-start');
