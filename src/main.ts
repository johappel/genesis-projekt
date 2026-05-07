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
import {
  createRelayJoinUrl,
  isAcceptedRoundClose,
  isAcceptedRoleClaim,
  isAcceptedVote,
  readMultiplayerUrlConfig,
  RelayMultiplayerRuntime,
} from './transport/runtime.js';
import { MULTIPLAYER_TUNING } from './transport/config.js';
import type { TransportEvent } from './transport/types.js';

// ============================================================
// ZUSTAND
// ============================================================
let state: GameState = createGame();
let pendingDecision: DecisionOption | null = null;
let pendingSystemicNotes: string[] = [];
let pendingOverlayAction: 'none' | 'render-case' | 'apply-round' | 'advance-after-round' = 'none';
const MULTIPLAYER_CONFIG = readMultiplayerUrlConfig(window.location.search);
const DEVELOPER_MODE = new URLSearchParams(window.location.search).has('dev');
const MULTIPLAYER_DEBUG_ENABLED = new URLSearchParams(window.location.search).get('debug') === '1';
const MULTIPLAYER_RULES_VERSION = 'v1';

let multiplayer: RelayMultiplayerRuntime | null = null;
let multiplayerStatusMessage = MULTIPLAYER_CONFIG
  ? MULTIPLAYER_CONFIG.mode === 'host'
    ? 'Relay-Raum wird vorbereitet.'
    : 'Verbinde mit bestehendem Relay-Raum.'
  : '';
const MULTIPLAYER_RECOVERY_TIMEOUT_MS = MULTIPLAYER_TUNING.recoveryTimeoutMs;

type PendingMultiplayerRequestKind = 'role-claim' | 'vote' | 'round-close';

type QueuedMultiplayerVote = {
  phaseKey: string;
  caseId: number;
  roleId: string;
  optionId: string;
  optionText: string;
  isTieBreak: boolean;
};

type MultiplayerIndicatorTone = 'local' | 'connected' | 'waiting' | 'syncing' | 'error';

type MultiplayerDebugEntry = {
  id: number;
  channel: 'out' | 'in' | 'info' | 'error';
  label: string;
  detail: string;
  createdAt: number;
  durationMs?: number;
};

const MULTIPLAYER_DEBUG_MAX_ENTRIES = 14;

let pendingMultiplayerRequest:
  | {
      kind: PendingMultiplayerRequestKind;
      timer: ReturnType<typeof setTimeout>;
      startedAt: number;
      label: string;
    }
  | null = null;

let queuedMultiplayerVote: QueuedMultiplayerVote | null = null;
let multiplayerQueueNotice = '';
let multiplayerDebugEntries: MultiplayerDebugEntry[] = [];
let multiplayerDebugSequence = 0;

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerRemaining = DECISION_TIMER_SECONDS;
let timedCaseIndex: number | null = null;
let timedPhaseKey: string | null = null;
let currentPhaseStartedAt: number | null = null;

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

function isMultiplayerMode(): boolean {
  return Boolean(multiplayer);
}

function getCurrentRoundId(): string {
  return `round-${state.currentCase}`;
}

function isCurrentRoleOwnedLocally(): boolean {
  return Boolean(state.selectedRole && multiplayer?.ownsRole(state.selectedRole.id));
}

function getCurrentVotePhaseKey(): string {
  return state.tieBreakOptions
    ? `${getCurrentRoundId()}:tie-break-${state.tieBreakRound}`
    : `${getCurrentRoundId()}:base`;
}

function hasOpenMultiplayerPhase(): boolean {
  return Boolean(state.selectedRole || pendingDecision || state.tieBreakOptions);
}

function isLocalOwnedRole(roleId: string | null): boolean {
  return Boolean(roleId && multiplayer?.ownsRole(roleId));
}

function markPhaseStarted(startedAt = Date.now()): void {
  currentPhaseStartedAt = startedAt;
  timedCaseIndex = state.currentCase;
  timedPhaseKey = getCurrentVotePhaseKey();
  timerRemaining = DECISION_TIMER_SECONDS;
}

function getSynchronizedTimerRemaining(): number {
  if (!currentPhaseStartedAt) {
    return DECISION_TIMER_SECONDS;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - currentPhaseStartedAt) / 1000));
  return Math.max(0, DECISION_TIMER_SECONDS - elapsedSeconds);
}

function getLocalOwnedRole(): typeof ROLES[number] | null {
  const runtime = multiplayer;
  if (!runtime) {
    return null;
  }

  return state.activeRoles.find((role) => runtime.ownsRole(role.id)) ?? null;
}

function getLocalPendingRole(): typeof ROLES[number] | null {
  const localRole = getLocalOwnedRole();
  if (!localRole || state.roundVotes[localRole.id]) {
    return null;
  }

  return localRole;
}

function getQueuedMultiplayerVote(): QueuedMultiplayerVote | null {
  const localPendingRole = getLocalPendingRole();
  if (!queuedMultiplayerVote || !localPendingRole) {
    return null;
  }

  if (queuedMultiplayerVote.phaseKey !== getCurrentVotePhaseKey()) {
    return null;
  }

  if (queuedMultiplayerVote.roleId !== localPendingRole.id) {
    return null;
  }

  return queuedMultiplayerVote;
}

function syncQueuedMultiplayerVote(): void {
  if (!isMultiplayerMode()) {
    queuedMultiplayerVote = null;
    multiplayerQueueNotice = '';
    return;
  }

  if (!getQueuedMultiplayerVote()) {
    queuedMultiplayerVote = null;
  }
}

function setMultiplayerStatus(message: string): void {
  multiplayerStatusMessage = message;
  updateMultiplayerStatusUI();
}

function pushMultiplayerDebugEntry(entry: Omit<MultiplayerDebugEntry, 'id' | 'createdAt'>): void {
  multiplayerDebugSequence += 1;
  multiplayerDebugEntries = [
    {
      id: multiplayerDebugSequence,
      createdAt: Date.now(),
      ...entry,
    },
    ...multiplayerDebugEntries,
  ].slice(0, MULTIPLAYER_DEBUG_MAX_ENTRIES);
  updateMultiplayerStatusUI();
}

function formatMultiplayerDebugTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getPendingRequestDuration(kind: PendingMultiplayerRequestKind): number | undefined {
  if (!pendingMultiplayerRequest || pendingMultiplayerRequest.kind !== kind) {
    return undefined;
  }

  return Date.now() - pendingMultiplayerRequest.startedAt;
}

function renderMultiplayerDebugPanel(): void {
  const rolesPanel = document.getElementById('roles-multiplayer-debug');
  const gamePanel = document.getElementById('game-multiplayer-debug');
  const rolesMeta = document.getElementById('roles-multiplayer-debug-meta');
  const gameMeta = document.getElementById('game-multiplayer-debug-meta');
  const rolesList = document.getElementById('roles-multiplayer-debug-list');
  const gameList = document.getElementById('game-multiplayer-debug-list');
  const showDebug = isMultiplayerMode() && MULTIPLAYER_DEBUG_ENABLED;

  rolesPanel?.classList.toggle('hidden', !showDebug);
  gamePanel?.classList.toggle('hidden', !showDebug);

  if (!showDebug) {
    return;
  }

  const metaText = `Recovery ${MULTIPLAYER_TUNING.recoveryTimeoutMs} ms · Join-Sync ${MULTIPLAYER_TUNING.initialStateSyncDelayMs} ms · ${multiplayer?.isHost ? 'Host' : 'Client'}`;
  if (rolesMeta) rolesMeta.textContent = metaText;
  if (gameMeta) gameMeta.textContent = metaText;

  const markup = multiplayerDebugEntries.length
    ? multiplayerDebugEntries.map((entry) => `
        <div class="multiplayer-debug-entry ${entry.channel}">
          <div class="multiplayer-debug-entry-top">
            <span class="multiplayer-debug-entry-label">${entry.label}</span>
            <span class="multiplayer-debug-entry-time">${formatMultiplayerDebugTime(entry.createdAt)}${entry.durationMs !== undefined ? ` · ${entry.durationMs} ms` : ''}</span>
          </div>
          <div class="multiplayer-debug-entry-detail">${entry.detail}</div>
        </div>
      `).join('')
    : '<div class="multiplayer-debug-empty">Noch keine Multiplayer-Ereignisse erfasst.</div>';

  if (rolesList) rolesList.innerHTML = markup;
  if (gameList) gameList.innerHTML = markup;
}

function requestMultiplayerSync(): void {
  if (!multiplayer) {
    return;
  }

  clearPendingMultiplayerRequest();
  setMultiplayerStatus('Synchronisierung manuell angefordert.');
  pushMultiplayerDebugEntry({
    channel: 'info',
    label: 'Manueller Sync',
    detail: 'Client fordert einen vollständigen State-Sync beim Host an.',
  });
  void multiplayer.requestStateSync().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'Unbekannter Relay-Fehler';
    setMultiplayerStatus(`Manuelle Synchronisierung fehlgeschlagen. ${detail}`);
    pushMultiplayerDebugEntry({
      channel: 'error',
      label: 'Sync fehlgeschlagen',
      detail,
    });
  });
}

function getMultiplayerIndicatorState(): { tone: MultiplayerIndicatorTone; label: string } {
  if (!isMultiplayerMode()) {
    return {
      tone: 'local',
      label: 'Lokaler Modus',
    };
  }

  if (pendingMultiplayerRequest?.kind === 'vote') {
    return {
      tone: 'waiting',
      label: 'Stimme ausstehend',
    };
  }

  if (pendingMultiplayerRequest) {
    return {
      tone: 'syncing',
      label: 'Bestätigung läuft',
    };
  }

  const lowerStatus = multiplayerStatusMessage.toLowerCase();
  if (
    lowerStatus.includes('abgelehnt')
    || lowerStatus.includes('fehlgeschlagen')
    || lowerStatus.includes('keine bestätigung')
    || lowerStatus.includes('nicht erreichbar')
    || lowerStatus.includes('relay-server')
  ) {
    return {
      tone: 'error',
      label: 'Sync prüfen',
    };
  }

  if (lowerStatus.includes('synchronisiert') || lowerStatus.includes('state-sync')) {
    return {
      tone: 'syncing',
      label: 'Synchronisiert',
    };
  }

  return {
    tone: 'connected',
    label: multiplayer?.isHost ? 'Relay verbunden · Host' : 'Relay verbunden',
  };
}

function clearPendingMultiplayerRequest(): void {
  if (!pendingMultiplayerRequest) {
    return;
  }

  clearTimeout(pendingMultiplayerRequest.timer);
  pendingMultiplayerRequest = null;
}

function isAwaitingVoteConfirmation(): boolean {
  return pendingMultiplayerRequest?.kind === 'vote';
}

function startPendingMultiplayerRequest(kind: PendingMultiplayerRequestKind, waitMessage: string): void {
  clearPendingMultiplayerRequest();
  pendingMultiplayerRequest = {
    kind,
    startedAt: Date.now(),
    label: waitMessage,
    timer: setTimeout(() => {
      const durationMs = pendingMultiplayerRequest ? Date.now() - pendingMultiplayerRequest.startedAt : undefined;
      pendingMultiplayerRequest = null;
      setMultiplayerStatus(`${waitMessage} Keine Bestätigung empfangen. Raum wird neu synchronisiert.`);
      pushMultiplayerDebugEntry({
        channel: 'error',
        label: `${kind} timeout`,
        detail: `${waitMessage} Keine Bestätigung empfangen, Vollsync wird angefordert.`,
        durationMs,
      });
      void multiplayer?.requestStateSync();
    }, MULTIPLAYER_RECOVERY_TIMEOUT_MS),
  };
}

function runMultiplayerRequest(params: {
  kind: PendingMultiplayerRequestKind;
  waitMessage: string;
  request: () => Promise<void>;
  errorMessage: string;
}): void {
  startPendingMultiplayerRequest(params.kind, params.waitMessage);
  pushMultiplayerDebugEntry({
    channel: 'out',
    label: `${params.kind} gesendet`,
    detail: params.waitMessage,
  });
  void params.request().catch((error: unknown) => {
    clearPendingMultiplayerRequest();
    const detail = error instanceof Error ? error.message : 'Unbekannter Relay-Fehler';
    setMultiplayerStatus(`${params.errorMessage} ${detail}. Raum wird neu synchronisiert.`);
    pushMultiplayerDebugEntry({
      channel: 'error',
      label: `${params.kind} fehlgeschlagen`,
      detail,
    });
    void multiplayer?.requestStateSync();
  });
}

function updateMultiplayerStatusUI(): void {
  const startStatus = document.getElementById('multiplayer-status');
  const rolesStatus = document.getElementById('roles-multiplayer-status');
  const roomBox = document.getElementById('multiplayer-room-box');
  const roomCode = document.getElementById('multiplayer-room-code') as HTMLInputElement | null;
  const inviteLink = document.getElementById('multiplayer-invite-link') as HTMLInputElement | null;
  const indicator = document.getElementById('multiplayer-connection-indicator') as HTMLButtonElement | null;
  const indicatorLabel = document.getElementById('multiplayer-connection-label');

  if (startStatus) {
    startStatus.textContent = multiplayerStatusMessage || 'Kein Relay-Mehrspieler aktiv.';
    const isError = getMultiplayerIndicatorState().tone === 'error';
    startStatus.style.color = isError ? 'var(--highlight)' : 'var(--text-dim)';
  }
  if (rolesStatus) {
    rolesStatus.textContent = multiplayerStatusMessage || 'Kein Relay-Mehrspieler aktiv.';
    const isError = getMultiplayerIndicatorState().tone === 'error';
    rolesStatus.style.color = isError ? 'var(--highlight)' : 'var(--text-dim)';
  }

  if (indicator && indicatorLabel) {
    const state = getMultiplayerIndicatorState();
    indicator.className = `connection-indicator connection-${state.tone}${isMultiplayerMode() ? '' : ' hidden'}`;
    indicatorLabel.textContent = state.label;
    indicator.disabled = !isMultiplayerMode();
    indicator.title = isMultiplayerMode()
      ? `${multiplayerStatusMessage || state.label} Klicken für manuelle Synchronisierung.`
      : 'Kein Relay-Mehrspieler aktiv.';
    indicator.setAttribute('aria-label', indicator.title);
  }

  renderMultiplayerDebugPanel();

  if (!roomBox || !roomCode || !inviteLink) {
    return;
  }

  if (!MULTIPLAYER_CONFIG) {
    roomBox.classList.add('hidden');
    return;
  }

  roomBox.classList.remove('hidden');
  roomCode.value = MULTIPLAYER_CONFIG.gameId;
  inviteLink.value = createRelayJoinUrl(window.location.href, MULTIPLAYER_CONFIG);
}

function updateRoleFlowAfterTransport(): void {
  updateRoleSelectionUI();
  updateSidebar();

  const activeScreen = document.querySelector('.screen.active')?.id;
  if (activeScreen === 'screen-game') {
    renderCase();
  }
}

function resetTransientMultiplayerUi(): void {
  clearTimer();
  pendingDecision = null;
  pendingSystemicNotes = [];
  pendingOverlayAction = 'none';
  multiplayerQueueNotice = '';
  document.getElementById('consequence-overlay')?.classList.add('hidden');
}

function publishOpenedPhase(statusMessage: string): void {
  const runtime = multiplayer;
  if (!runtime?.isHost) {
    return;
  }

  markPhaseStarted();
  setMultiplayerStatus(statusMessage);
  showScreen('screen-game');
  renderCase();
  void runtime.openPhase().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'Unbekannter Relay-Fehler';
    setMultiplayerStatus(`Neue Phase konnte nicht verteilt werden. ${detail}. Raum wird neu synchronisiert.`);
    void runtime.requestStateSync();
  });
  void runtime.broadcastStateSync().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'Unbekannter Relay-Fehler';
    setMultiplayerStatus(`Phase wurde geoeffnet, aber der Folgesync konnte nicht verteilt werden. ${detail}`);
  });
}

function canVoteInCurrentClient(): boolean {
  return (!isMultiplayerMode() || isCurrentRoleOwnedLocally()) && !isAwaitingVoteConfirmation();
}

function canInteractWithDecisionCards(): boolean {
  if (!isMultiplayerMode()) {
    return canVoteInCurrentClient();
  }

  const localPendingRole = getLocalPendingRole();
  if (!localPendingRole) {
    return false;
  }

  return !(state.selectedRole?.id === localPendingRole.id && isAwaitingVoteConfirmation());
}

function getRoleRejectionReasonLabel(reason: string): string {
  switch (reason) {
    case 'ROLE_NOT_FOUND':
      return 'Diese Rolle existiert im Raum nicht.';
    case 'ROLE_ALREADY_TAKEN':
      return 'Diese Rolle ist bereits von jemand anderem belegt.';
    case 'GAME_FULL':
      return 'Der Raum ist bereits voll.';
    case 'PLAYER_ALREADY_HAS_ROLE':
      return 'Du hast in diesem Raum bereits eine Rolle.';
    default:
      return `Unbekannter Ablehnungsgrund (${reason}). Prüfe die Relay-Verbindung.`;
  }
}

function getVoteRejectionReasonLabel(reason?: string): string {
  switch (reason) {
    case 'TURN_MISMATCH':
      return 'Die Runde war beim Host schon weiter. Deine Vormerkung wurde nicht mehr uebernommen';
    case 'ROUND_MISMATCH':
      return 'Die Runde hat sich geaendert. Bitte synchronisiere kurz neu';
    case 'ALREADY_VOTED':
      return 'Diese Rolle hat fuer die aktuelle Phase bereits abgestimmt';
    case 'ROLE_NOT_OWNED':
      return 'Diese Rolle gehoert in diesem Raum einem anderen Client';
    case 'ROLE_NOT_CLAIMED':
      return 'Die Rolle ist im Raum noch nicht sauber zugewiesen';
    default:
      return reason ?? 'unbekannter Grund';
  }
}

function submitMultiplayerVote(option: DecisionOption, source: 'manual' | 'queued'): void {
  const runtime = multiplayer;
  const selectedRole = state.selectedRole;
  if (!runtime || !selectedRole) {
    return;
  }

  clearTimer();
  runMultiplayerRequest({
    kind: 'vote',
    waitMessage: `Stimme fuer ${option.text} haengt fest.`,
    request: () => runtime.castVote({
      caseId: state.currentCase + 1,
      phaseKey: getCurrentVotePhaseKey(),
      roleId: selectedRole.id,
      optionId: option.id,
      isTieBreak: Boolean(state.tieBreakOptions),
    }),
    errorMessage: 'Stimme konnte nicht uebertragen werden.',
  });
  setMultiplayerStatus(
    source === 'queued'
      ? `Vorgemerkte Stimme fuer ${option.text} wird jetzt fuer ${selectedRole.name} uebertragen.`
      : `Stimme fuer ${option.text} gesendet. Warte auf Bestaetigung.`
  );
  renderCase();
}

function queueMultiplayerVote(option: DecisionOption): void {
  const localPendingRole = getLocalPendingRole();
  if (!localPendingRole) {
    setMultiplayerStatus('Deine Rolle hat in dieser Runde bereits abgestimmt oder ist noch nicht sauber synchronisiert.');
    return;
  }

  const existingQueuedVote = getQueuedMultiplayerVote();
  if (
    existingQueuedVote
    && existingQueuedVote.roleId === localPendingRole.id
    && existingQueuedVote.optionId === option.id
  ) {
    queuedMultiplayerVote = null;
    multiplayerQueueNotice = '';
    setMultiplayerStatus(`Vormerkung fuer ${localPendingRole.name} wurde entfernt.`);
    renderCase();
    return;
  }

  queuedMultiplayerVote = {
    phaseKey: getCurrentVotePhaseKey(),
    caseId: state.currentCase + 1,
    roleId: localPendingRole.id,
    optionId: option.id,
    optionText: option.text,
    isTieBreak: Boolean(state.tieBreakOptions),
  };
  multiplayerQueueNotice = '';
  setMultiplayerStatus(`„${option.text}“ ist fuer ${localPendingRole.name} vorgemerkt und wird bei ihrem Zug automatisch gesendet.`);
  renderCase();
}

function maybeAutoSubmitQueuedVote(caseData: typeof CASES[0]): boolean {
  if (!isMultiplayerMode() || isAwaitingVoteConfirmation()) {
    return false;
  }

  const queuedVote = getQueuedMultiplayerVote();
  if (!queuedVote || state.selectedRole?.id !== queuedVote.roleId) {
    return false;
  }

  const option = getAvailableDecisions(caseData).find((decision) => decision.id === queuedVote.optionId);
  if (!option) {
    queuedMultiplayerVote = null;
    return false;
  }

  submitMultiplayerVote(option, 'queued');
  return true;
}

function addActiveRoleById(roleId: string): void {
  if (state.activeRoles.some((role) => role.id === roleId)) {
    return;
  }

  const role = ROLES.find((entry) => entry.id === roleId);
  if (!role) {
    return;
  }

  state = {
    ...state,
    activeRoles: [...state.activeRoles, role],
  };
}

function syncRoleSelectionFromOwners(): void {
  if (!multiplayer) {
    return;
  }

  for (const roleId of Object.keys(multiplayer.getRoleOwners())) {
    addActiveRoleById(roleId);
  }
}

function buildRoundVoteSummary(): Array<{ roleId: string; optionId: string; playerId: string }> {
  const roleOwners = multiplayer?.getRoleOwners() ?? {};

  return state.activeRoles
    .map((role) => {
      const optionId = state.roundVotes[role.id];
      const playerId = roleOwners[role.id];
      if (!optionId || !playerId) {
        return null;
      }

      return {
        roleId: role.id,
        optionId,
        playerId,
      };
    })
    .filter((entry): entry is { roleId: string; optionId: string; playerId: string } => Boolean(entry));
}

function getResolvedVoteCount(optionId: string): number {
  return Object.values(state.roundVotes).filter((currentOptionId) => currentOptionId === optionId).length;
}

function applyAcceptedVote(event: Extract<TransportEvent, { eventName: 'vote-cast' }>): void {
  if (state.roundVotes[event.roleId]) {
    return;
  }

  const caseData = CASES[state.currentCase];
  if (!caseData) {
    return;
  }

  const votingRole = state.activeRoles.find((role) => role.id === event.roleId) ?? null;
  if (!votingRole) {
    return;
  }

  const availableDecisions = getAvailableDecisions(caseData);
  const optionIds = availableDecisions.map((decision) => decision.id);
  const voteState = {
    ...state,
    selectedRole: votingRole,
  };
  const voteResult = castVote(voteState, event.caseId, event.optionId, optionIds);
  if (!voteResult.ok) {
    return;
  }

  const votedRoleName = votingRole.name;
  state = voteResult.state;
  clearTimer();

  if (!haveAllActiveRolesVoted(state)) {
    state = advanceToNextRole(state);

    if (isMultiplayerMode()) {
      setMultiplayerStatus(
        isCurrentRoleOwnedLocally()
          ? `Du bist jetzt mit ${state.selectedRole?.name ?? 'deiner Rolle'} am Zug. Vorgemerkte Wahlen werden sofort uebernommen.`
          : `Warte auf ${state.selectedRole?.name ?? 'die naechste Rolle'} im Relay-Raum.`
      );
      renderCase();
      return;
    }

    showHandoverNotice(votedRoleName, state.selectedRole?.name ?? 'naechste Rolle');
    return;
  }

  const roundDecision = determineRoundDecision(state, optionIds);
  if (!roundDecision) {
    return;
  }

  if (roundDecision.status === 'tie-break') {
    if (isMultiplayerMode()) {
      if (multiplayer?.isHost) {
        state = beginTieBreak(state, roundDecision.optionIds);
        showTieBreakNotice(caseData, roundDecision.optionIds, roundDecision.voteCount);
      } else {
        setMultiplayerStatus('Gleichstand erkannt. Warte auf die host-autoritative Stichwahlphase.');
      }
      return;
    }

    state = beginTieBreak(state, roundDecision.optionIds);
    showTieBreakNotice(caseData, roundDecision.optionIds, roundDecision.voteCount);
    return;
  }

  if (multiplayer?.isHost) {
    const runtime = multiplayer;
    if (!runtime) {
      return;
    }

    runMultiplayerRequest({
      kind: 'round-close',
      waitMessage: 'Rundenabschluss hängt fest.',
      request: () => runtime.closeRound({
        caseId: event.caseId,
        phaseKey: getCurrentVotePhaseKey(),
        resolvedOptionId: roundDecision.optionId,
        voteSummary: buildRoundVoteSummary(),
      }),
      errorMessage: 'Rundenabschluss konnte nicht übertragen werden.',
    });
    setMultiplayerStatus('Host bestätigt den Rundenabschluss über das Relay.');
    return;
  }

  setMultiplayerStatus('Warte auf den host-autoritativen Rundenabschluss.');
}

function applyAcceptedRoundClose(event: Extract<TransportEvent, { eventName: 'round-closed' }>): void {
  const caseData = CASES[state.currentCase];
  if (!caseData) {
    return;
  }

  const decision = caseData.decisions.find((entry) => entry.id === event.resolvedOptionId) ?? null;
  if (!decision) {
    return;
  }

  pendingDecision = decision;
  showConsequence(decision, getResolvedVoteCount(event.resolvedOptionId));
}

function restoreAcceptedRoundCloseFromSync(roundClose: {
  resolvedOptionId: string;
}): void {
  const caseData = CASES[state.currentCase];
  if (!caseData) {
    return;
  }

  const decision = caseData.decisions.find((entry) => entry.id === roundClose.resolvedOptionId) ?? null;
  if (!decision) {
    return;
  }

  pendingDecision = decision;
  showConsequence(decision, getResolvedVoteCount(roundClose.resolvedOptionId));
}

function handleMultiplayerTransportEvent(event: TransportEvent): void {
  const eventSummary = event.eventName === 'vote-cast'
    ? `${event.roleId} → ${event.optionId} · ${event.voteStatus}`
    : event.eventName === 'role-claimed'
      ? `${event.roleId} · ${event.claimStatus}`
      : event.eventName === 'round-closed'
        ? `${event.resolvedOptionId} · ${event.roundCloseStatus}`
        : event.eventName === 'phase-opened'
          ? event.snapshot.state.tieBreakOptions
            ? `Stichwahl ${event.snapshot.state.tieBreakRound}`
            : 'Spielphase geöffnet'
          : event.eventName === 'state-sync-sent'
            ? `Snapshot Fall ${event.snapshot.state.currentCase + 1}`
            : event.eventName;
  pushMultiplayerDebugEntry({
    channel: 'in',
    label: `Event: ${event.eventName}`,
    detail: eventSummary,
    durationMs: event.eventName === 'vote-cast'
      ? getPendingRequestDuration('vote')
      : event.eventName === 'round-closed'
        ? getPendingRequestDuration('round-close')
        : event.eventName === 'role-claimed'
          ? getPendingRequestDuration('role-claim')
          : undefined,
  });

  if (event.eventName === 'game-created') {
    setMultiplayerStatus(`Relay-Raum ${event.gameId} aktiv. Rollen koennen jetzt online geclaimt werden.`);
    return;
  }

  if (event.eventName === 'state-sync-sent') {
    const activeScreenBeforeSync = document.querySelector('.screen.active')?.id;
    clearPendingMultiplayerRequest();
    resetTransientMultiplayerUi();
    state = event.snapshot.state;
    currentPhaseStartedAt = event.snapshot.phaseStartedAt ?? null;
    timedCaseIndex = currentPhaseStartedAt !== null ? state.currentCase : null;
    timedPhaseKey = currentPhaseStartedAt !== null ? getCurrentVotePhaseKey() : null;
    syncRoleSelectionFromOwners();
    updateRoleFlowAfterTransport();

    const shouldOpenGameScreen = activeScreenBeforeSync === 'screen-game'
      || Boolean(event.snapshot.pendingRoundClose)
      || Boolean(state.selectedRole);

    if (state.activeRoles.length >= 2 && shouldOpenGameScreen) {
      showScreen('screen-game');
      if (event.snapshot.pendingRoundClose) {
        renderCase();
        restoreAcceptedRoundCloseFromSync(event.snapshot.pendingRoundClose);
      } else if (state.selectedRole) {
        renderCase();
      } else if (isMultiplayerMode()) {
        renderWaitingForMultiplayerStart();
      }
    }

    if (multiplayer?.isHost && event.authoritativePlayerId === multiplayer.playerId) {
      return;
    }

    setMultiplayerStatus(
      event.snapshot.pendingRoundClose
        ? 'State-Sync empfangen. Rundenabschluss wurde wiederhergestellt.'
        : isCurrentRoleOwnedLocally()
        ? `State-Sync empfangen. Du bist jetzt am Zug.`
        : `State-Sync empfangen. Raum ${event.gameId} ist bereit.`
    );
    return;
  }

  if (event.eventName === 'phase-opened') {
    resetTransientMultiplayerUi();
    const previousHadTieBreak = Boolean(state.tieBreakOptions);
    const hadQueuedVote = Boolean(getQueuedMultiplayerVote());
    state = event.snapshot.state;
    currentPhaseStartedAt = event.snapshot.phaseStartedAt ?? null;
    timedCaseIndex = currentPhaseStartedAt !== null ? state.currentCase : null;
    timedPhaseKey = currentPhaseStartedAt !== null ? getCurrentVotePhaseKey() : null;
    syncRoleSelectionFromOwners();

    if (!previousHadTieBreak && state.tieBreakOptions) {
      multiplayerQueueNotice = hadQueuedVote
        ? 'Die alte Vormerkung wurde fuer die Stichwahl verworfen. Bitte waehle zwischen den verbleibenden Optionen neu.'
        : 'Die Stichwahl ist gestartet. Bitte waehle jetzt nur noch zwischen den verbleibenden Optionen.';
    }

    showScreen('screen-game');
    renderCase();
    setMultiplayerStatus(
      state.tieBreakOptions
        ? 'Die host-autoritative Stichwahlphase ist offen.'
        : isCurrentRoleOwnedLocally()
          ? 'Die host-autoritative Spielphase ist offen. Du bist dran oder kannst vormerken.'
          : 'Die host-autoritative Spielphase ist offen. Du kannst deine Rolle erkennen und bei Bedarf vormerken.'
    );
    return;
  }

  if (event.eventName === 'role-claimed') {
    const roleEvent = event;

    if (isAcceptedRoleClaim(event)) {
      if (roleEvent.claimedByPlayerId === multiplayer?.playerId) {
        clearPendingMultiplayerRequest();
      }
      addActiveRoleById(roleEvent.roleId);
      updateRoleFlowAfterTransport();

      if (roleEvent.claimedByPlayerId === multiplayer?.playerId) {
        setMultiplayerStatus(`Rolle ${ROLES.find((role) => role.id === roleEvent.roleId)?.name ?? roleEvent.roleId} ist dir zugewiesen.`);
      } else {
        setMultiplayerStatus(`Rolle ${ROLES.find((role) => role.id === roleEvent.roleId)?.name ?? roleEvent.roleId} wurde im Raum vergeben.`);
      }
      return;
    }

    if (roleEvent.claimStatus === 'rejected' && roleEvent.claimedByPlayerId === multiplayer?.playerId) {
      clearPendingMultiplayerRequest();
      const rejectionHint = roleEvent.rejectionReason
        ? getRoleRejectionReasonLabel(roleEvent.rejectionReason)
        : multiplayerStatusMessage.toLowerCase().includes('nicht erreichbar')
          ? 'Der Host konnte nicht erreicht werden. Prüfe die Relay-Verbindung und versuche es erneut.'
          : 'Kein Host erreichbar – der Raum wurde möglicherweise noch nicht geöffnet oder das Relay ist nicht verbunden.';
      setMultiplayerStatus(`Rollenwahl abgelehnt. ${rejectionHint}`);
    }
    return;
  }

  if (event.eventName === 'vote-cast') {
    const voteEvent = event;

    if (isAcceptedVote(event)) {
      if (voteEvent.playerId === multiplayer?.playerId) {
        clearPendingMultiplayerRequest();
      }
      applyAcceptedVote(voteEvent);
      return;
    }

    if (voteEvent.voteStatus === 'rejected' && voteEvent.playerId === multiplayer?.playerId) {
      clearPendingMultiplayerRequest();
      queuedMultiplayerVote = null;
      if (voteEvent.rejectionReason === 'ALREADY_VOTED') {
        setMultiplayerStatus('Deine Stimme war beim Host bereits erfasst. Synchronisierung wird nachgezogen.');
        void multiplayer?.requestStateSync();
        return;
      }
      setMultiplayerStatus(`Stimme abgelehnt: ${getVoteRejectionReasonLabel(voteEvent.rejectionReason)}.`);
    }
    return;
  }

  if (event.eventName === 'round-closed') {
    const roundCloseEvent = event;

    if (isAcceptedRoundClose(event)) {
      clearPendingMultiplayerRequest();
      applyAcceptedRoundClose(roundCloseEvent);
      setMultiplayerStatus('Rundenabschluss bestätigt.');
      return;
    }

    if (roundCloseEvent.roundCloseStatus === 'rejected' && multiplayer?.isHost) {
      clearPendingMultiplayerRequest();
      setMultiplayerStatus(`Rundenabschluss abgelehnt: ${roundCloseEvent.rejectionReason ?? 'unbekannter Grund'}.`);
    }
  }
}

function startRelayHost(): void {
  const relayInput = document.getElementById('multiplayer-relay-input') as HTMLInputElement | null;
  const relayUrl = relayInput?.value.trim() || 'http://localhost:7000/';
  const url = new URL(window.location.href);
  url.searchParams.set('mp', 'host');
  url.searchParams.set('game', crypto.randomUUID().slice(0, 8));
  url.searchParams.set('relay', relayUrl);
  window.location.href = url.toString();
}

function joinRelayGame(): void {
  const relayInput = document.getElementById('multiplayer-relay-input') as HTMLInputElement | null;
  const gameInput = document.getElementById('multiplayer-game-input') as HTMLInputElement | null;
  const relayUrl = relayInput?.value.trim() || 'http://localhost:7000/';
  const gameId = gameInput?.value.trim();

  if (!gameId) {
    setMultiplayerStatus('Bitte zuerst einen Raumcode eingeben.');
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('mp', 'join');
  url.searchParams.set('game', gameId);
  url.searchParams.set('relay', relayUrl);
  window.location.href = url.toString();
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

function isRoundSummaryActive(): boolean {
  return pendingOverlayAction === 'apply-round' && Boolean(pendingDecision);
}

function getDisplayedRoundVoteCount(): number {
  return isRoundSummaryActive() ? state.activeRoles.length : getCurrentRoundVoteCount();
}

function getRoundStatusLabel(): string {
  if (isRoundSummaryActive()) {
    return `Runde abgeschlossen · ${getDisplayedRoundVoteCount()}/${state.activeRoles.length} Stimmen`;
  }

  const currentRoleName = state.selectedRole?.name
    ? `${isLocalOwnedRole(state.selectedRole.id) ? '👑 ' : ''}${state.selectedRole.name}`
    : '–';
  return `Am Zug: ${currentRoleName} · ${getDisplayedRoundVoteCount()}/${state.activeRoles.length} Stimmen${state.tieBreakOptions ? ' · Stichwahl' : ''}${DEVELOPER_MODE ? ' · DEV' : ''}`;
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
  if (isMultiplayerMode()) {
    if (!state.activeRoles.length) {
      return 'Claimt mindestens zwei Rollen im Relay-Raum, bevor ihr die erste Runde lokal öffnet.';
    }

    const names = state.activeRoles.map((role) => {
      const suffix = multiplayer?.ownsRole(role.id) ? ' (du)' : '';
      return `${role.name}${suffix}`;
    }).join(', ');
    const hostHint = multiplayer?.isHost
      ? ' Nur der Host startet die Partie fuer alle.'
      : ' Warte auf den Host; der Spielstart wird fuer alle gleichzeitig geoeffnet.';
    return `${state.activeRoles.length} Online-Rollen aktiv: ${names}.${hostHint}`;
  }

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
    const roleId = card.dataset.roleId ?? '';
    const isSelected = state.activeRoles.some((role) => card.id === `role-card-${role.id}`);
    const isOwnedLocally = roleId ? Boolean(multiplayer?.ownsRole(roleId)) : false;
    const isTakenRemotely = roleId ? state.activeRoles.some((role) => role.id === roleId) && !isOwnedLocally : false;
    const ownerIndicator = card.querySelector<HTMLElement>('.role-owner-indicator');

    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', String(isSelected));
    card.setAttribute('aria-disabled', String(isMultiplayerMode() && isTakenRemotely));
    card.style.opacity = isMultiplayerMode() && isTakenRemotely ? '0.6' : '1';
    if (ownerIndicator) {
      ownerIndicator.textContent = isOwnedLocally
        ? 'Deine Rolle'
        : isTakenRemotely
          ? 'Bereits vergeben'
          : isMultiplayerMode()
            ? 'Online frei'
            : '';
    }
  });

  const btn = document.getElementById('btn-start-game') as HTMLButtonElement | null;
  const clientWaitHint = document.getElementById('client-wait-hint');
  const hint = document.getElementById('role-hint');
  const isClient = isMultiplayerMode() && !multiplayer?.isHost;
  if (btn) {
    btn.disabled = state.activeRoles.length < 2;
    btn.textContent = isMultiplayerMode()
      ? isClient
        ? '🎮 Spiel lokal öffnen'
        : '🎮 Spiel für alle starten'
      : '🎮 Spiel starten';
  }
  if (clientWaitHint) {
    clientWaitHint.classList.toggle('hidden', !isClient);
  }
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
  const localTurn = !isMultiplayerMode() || isCurrentRoleOwnedLocally();
  const preVoteText = councilPreVote
    ? `Der Rat würde vorläufig für „${councilPreVote.text}“ stimmen, sofern ihr das nicht überstimmt.`
    : '';

  icon.textContent = state.selectedRole?.icon ?? '👤';
  title.textContent = state.selectedRole?.name ?? 'Naechste Rolle';
  text.textContent = isMultiplayerMode()
    ? localTurn
      ? 'Du bist jetzt online am Zug.'
      : `${state.selectedRole?.name ?? 'Die nächste Rolle'} stimmt jetzt in einer anderen Sitzung ab.`
    : 'Du bist am Zug.';
  reflexion.textContent = [
    details ?? (isMultiplayerMode()
      ? localTurn
        ? 'Gib deine Stimme in diesem Browser ab. Die Annahme wird host-autoritativ über das Relay bestätigt.'
        : 'Warte auf die aktuelle Online-Rolle. Nach OK siehst du denselben Fall im Lesemodus.'
      : 'Lest den Fall gemeinsam und gebt das Geraet erst nach deiner Stimmabgabe weiter.'),
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
  if (isMultiplayerMode()) {
    multiplayerQueueNotice = '';
    if (nextCase) {
      if (multiplayer?.isHost) {
        publishOpenedPhase(`Naechster Fall offen: ${nextCase.title}. Alle Clients wechseln jetzt gemeinsam in die neue Runde.`);
      } else {
        setMultiplayerStatus(`Warte auf den Host, der ${nextCase.title} fuer alle freigibt.`);
      }
      return;
    }

    showScreen('screen-finale');
    return;
  }

  const overlay = document.getElementById('consequence-overlay');
  const icon = document.getElementById('consequence-icon');
  const title = document.getElementById('consequence-title');
  const text = document.getElementById('consequence-text');
  const reflexion = document.getElementById('consequence-reflexion');
  const changesEl = document.getElementById('consequence-changes');
  if (!overlay || !icon || !title || !text || !reflexion || !changesEl) return;

  icon.textContent = state.selectedRole?.icon ?? '👤';
  title.textContent = 'Nächste Runde';
  text.textContent = isMultiplayerMode()
    ? `${state.selectedRole?.name ?? 'Die nächste Rolle'} ist jetzt im Relay-Raum dran.`
    : `${state.selectedRole?.name ?? 'Die nächste Rolle'} ist jetzt dran.`;
  reflexion.textContent = nextCase
    ? `Als Nächstes liegt ${nextCase.ki} vor euch: ${nextCase.title}. ${isMultiplayerMode() ? 'Alle Clients öffnen danach denselben Fall lokal.' : 'Erst nach OK wird der neue Fall eingeblendet.'}`
    : 'Erst nach OK wird die nächste Runde eingeblendet.';
  changesEl.innerHTML = `<span class="value-change-item change-shift">${isMultiplayerMode() ? 'Nächste Online-Rolle' : 'Gerät übergeben'}</span>`;

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
    card.dataset.roleId = role.id;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="role-icon-lg">${role.icon}</div>
      <div class="role-title">${role.name}</div>
      <div style="font-size:0.82em;color:var(--text-dim);margin-bottom:8px">${role.perspective}</div>
      <div style="font-size:0.88em;line-height:1.6">${role.desc}</div>
      <div class="role-ability">${role.abilityDescription}</div>
      <div class="role-owner-indicator" style="margin-top:10px;font-size:0.76em;color:var(--text-dim)"></div>
    `;
    card.addEventListener('click', () => selectRole(role.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') selectRole(role.id); });
    grid.appendChild(card);
  });

  updateRoleSelectionUI();
}

function selectRole(roleId: string): void {
  if (isMultiplayerMode()) {
    runMultiplayerRequest({
      kind: 'role-claim',
      waitMessage: `Rollenclaim für ${ROLES.find((role) => role.id === roleId)?.name ?? roleId} hängt fest.`,
      request: () => multiplayer?.claimRole(roleId) ?? Promise.resolve(),
      errorMessage: 'Rollenclaim fehlgeschlagen.',
    });
    setMultiplayerStatus(`Rollenclaim für ${ROLES.find((role) => role.id === roleId)?.name ?? roleId} gesendet.`);
    return;
  }

  const result = assignRole(state, roleId);
  if (!result.ok) return;
  state = result.state;
  updateRoleSelectionUI();
}

// ============================================================
// SPIELSTART
// ============================================================
function startGame(): void {
  const runtime = multiplayer;
  if (isMultiplayerMode() && runtime && !runtime.isHost) {
    setMultiplayerStatus(
      hasOpenMultiplayerPhase()
        ? 'Lokale Partieansicht wird geöffnet und mit dem Host synchronisiert.'
        : 'Lokale Partieansicht wird vorbereitet. Sobald der Host die Runde öffnet, wechselst du automatisch hinein.'
    );
    showScreen('screen-game');
    if (hasOpenMultiplayerPhase()) {
      renderCase();
    } else {
      renderWaitingForMultiplayerStart();
    }
    void runtime.requestStateSync();
    return;
  }

  if (state.activeRoles.length < 2) return;
  state = resetRoundVotingState({
    ...state,
    selectedRole: state.activeRoles[0] ?? null,
    currentRoleIndex: 0,
    selectedLens: null,
  });

  if (isMultiplayerMode()) {
    publishOpenedPhase('Die Runde ist offen. Der Host hat den ersten Fall fuer alle gestartet.');
    return;
  }

  showScreen('screen-game');
  updateSidebar();

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

  if (isMultiplayerMode() && !hasOpenMultiplayerPhase()) {
    renderWaitingForMultiplayerStart();
    return;
  }

  syncQueuedMultiplayerVote();

  // Header / Progress
  const phaseEl = document.getElementById('phase-indicator');
  const roleDisp = document.getElementById('current-role-display');
  const progressFill = document.getElementById('progress-fill');
  if (phaseEl) phaseEl.textContent = `Fall ${state.currentCase + 1} von ${CASES.length}`;
  if (roleDisp) {
    roleDisp.textContent = getRoundStatusLabel();
  }
  if (progressFill) progressFill.style.width = `${(state.currentCase / CASES.length) * 100}%`;

  updateValuesDisplay();
  updateProtocol();
  updateSidebar();
  renderScenarioPanel(caseData);
  if (maybeAutoSubmitQueuedVote(caseData)) {
    return;
  }
  if ((isMultiplayerMode() && !isRoundSummaryActive()) || canVoteInCurrentClient()) {
    startDecisionTimer(caseData);
  } else {
    clearTimer();
    updateTimerDisplay();
  }

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

function renderWaitingForMultiplayerStart(): void {
  clearTimer();

  const caseData = CASES[state.currentCase];
  const phaseEl = document.getElementById('phase-indicator');
  const roleDisp = document.getElementById('current-role-display');
  const progressFill = document.getElementById('progress-fill');
  const panel = document.getElementById('scenario-panel');
  if (!panel) return;

  if (phaseEl) phaseEl.textContent = `Fall ${state.currentCase + 1} von ${CASES.length}`;
  if (roleDisp) roleDisp.textContent = 'Warte auf den Host · Phase noch nicht geöffnet';
  if (progressFill) progressFill.style.width = `${(state.currentCase / CASES.length) * 100}%`;

  updateValuesDisplay();
  updateProtocol();
  updateSidebar();

  panel.innerHTML = `
    <div class="scenario-tag multiplayer">Relay-Raum</div>
    <div class="scenario-title">Partie ist verbunden</div>
    <div class="scenario-text">${caseData ? `Die Rollen sind für ${caseData.title} bereit, aber der Host hat die aktuelle Phase noch nicht freigegeben.` : 'Die Rollen sind verbunden, aber es wurde noch keine Phase freigegeben.'}</div>
    <div class="round-status">
      <div class="round-status-title">Wartezustand</div>
      <div class="round-status-text">Sobald der Host die Runde oder Stichwahl öffnet, erscheint derselbe Fall automatisch in allen Sitzungen.</div>
    </div>
  `;
}

// ============================================================
// SZENARIO-PANEL
// ============================================================
function renderScenarioPanel(caseData: typeof CASES[0]): void {
  const panel = document.getElementById('scenario-panel');
  if (!panel) return;

  const activeLens: Lens | null = state.selectedLens;
  const availableDecisions = getAvailableDecisions(caseData);
  const voteCount = getDisplayedRoundVoteCount();
  const modeLabel = isRoundSummaryActive()
    ? 'Rundenabschluss'
    : state.tieBreakOptions
      ? 'Stichwahl'
      : 'Ratsrunde';
  const canVoteHere = canVoteInCurrentClient();
  const canInteractHere = canInteractWithDecisionCards();
  const localPendingRole = getLocalPendingRole();
  const queuedVote = getQueuedMultiplayerVote();
  const roundStatusText = isRoundSummaryActive()
    ? `Die Runde wurde host-autoritativ abgeschlossen. Erfasst: ${voteCount} von ${state.activeRoles.length} Stimmen.`
    : `<strong>${state.selectedRole?.name ?? '–'}</strong> stimmt jetzt ab. Bereits erfasst: ${voteCount} von ${state.activeRoles.length} Stimmen.`;
  const decisionGuidance = !isMultiplayerMode()
    ? (canVoteHere
      ? (DEVELOPER_MODE ? 'Developer-Mode aktiv: Rohwerte sichtbar.' : 'Folgen als Tendenzen: Die Runde bleibt verdeckt, bis alle aktiven Rollen abgestimmt haben.')
      : isAwaitingVoteConfirmation()
        ? 'Deine Stimme wurde gesendet. Warte auf die host-autoritative Bestätigung.'
        : 'Warte auf die Rolle, die in diesem Relay-Raum gerade stimmberechtigt ist.')
    : !localPendingRole
      ? 'Deine lokale Rolle hat fuer diese Runde bereits abgestimmt oder ist noch nicht geclaimt.'
      : state.selectedRole?.id === localPendingRole.id
        ? isAwaitingVoteConfirmation()
          ? 'Deine Stimme wurde gesendet. Warte auf die host-autoritative Bestätigung.'
          : queuedVote
            ? `Du bist am Zug. Die vorgemerkte Wahl „${queuedVote.optionText}“ wird jetzt automatisch uebertragen.`
            : 'Du bist am Zug. Stimme jetzt ab.'
        : queuedVote
          ? `„${queuedVote.optionText}“ ist fuer ${localPendingRole.name} vorgemerkt. Du kannst die Wahl bis zu ihrem Zug noch aendern.`
          : `${localPendingRole.name} ist noch nicht am Zug. Du kannst deine Entscheidung jetzt vormerken; sie wird spaeter automatisch uebertragen.`;
  const queuedNoteMarkup = queuedVote && localPendingRole
    ? `<div class="decision-queue-note">Vorgemerkt fuer ${localPendingRole.name}: ${queuedVote.optionText}</div>`
    : '';
  const queueNoticeMarkup = multiplayerQueueNotice
    ? `<div class="decision-queue-reset-note">${multiplayerQueueNotice}</div>`
    : '';

  panel.innerHTML = `
    <div class="scenario-tag ${caseData.tagClass}">${caseData.tag}</div>
    <div class="scenario-ki-badge">${caseData.kiIcon} ${caseData.ki}</div>
    <div class="scenario-title">${caseData.title}</div>
    <div class="scenario-text">${caseData.situation}</div>
    <div class="round-status">
      <div class="round-status-title">${modeLabel}</div>
      <div class="round-status-text">${roundStatusText}</div>
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
      <div class="decision-guidance">${decisionGuidance}</div>
      ${queueNoticeMarkup}
      ${queuedNoteMarkup}
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
          const isQueued = queuedVote?.optionId === d.id;
          return `
          <div class="decision-card${isQueued ? ' queued' : ''}" tabindex="0" style="${canInteractHere ? '' : 'opacity:0.5;pointer-events:none;'}"
               ${canInteractHere ? `onclick="handleDecision('${d.id}')" onkeydown="if(event.key==='Enter'||event.key===' ')handleDecision('${d.id}')"` : ''}>
            <div class="decision-text">${d.icon} ${d.text}</div>
            ${isQueued ? '<div class="decision-queued-badge">Vorgemerkt</div>' : ''}
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

  if (isMultiplayerMode()) {
    const localPendingRole = getLocalPendingRole();
    if (!localPendingRole) {
      setMultiplayerStatus('Deine lokale Rolle kann in dieser Phase gerade keine Stimme mehr abgeben.');
      return;
    }

    if (state.selectedRole?.id !== localPendingRole.id) {
      queueMultiplayerVote(option);
      return;
    }
  }

  // Prophetisches Veto prüfen
  if (state.abilities.prophetinVetoActive) {
    clearTimer();
    state = { ...state, abilities: { ...state.abilities, prophetinVetoActive: false } };
    showVetoNotice();
    return;
  }

  const optionIds = availableDecisions.map((decision) => decision.id);

  if (isMultiplayerMode() && state.selectedRole) {
    submitMultiplayerVote(option, 'manual');
    return;
  }

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
  text.textContent = isMultiplayerMode()
    ? `${nextRoleName} ist jetzt im Relay-Raum dran.`
    : `Jetzt stimmt Spieler ${getCurrentRolePosition()}${state.activeRoles.length ? ` von ${state.activeRoles.length}` : ''}: ${nextRoleName}.`;
  reflexion.textContent = currentCase
    ? (isMultiplayerMode()
      ? `${votedRoleName} hat bereits abgestimmt. ${nextRoleName} stimmt jetzt in der eigenen Sitzung über Fall ${state.currentCase + 1} ab: ${currentCase.title}.`
      : `${votedRoleName} hat bereits abgestimmt. ${nextRoleName} soll jetzt über Fall ${state.currentCase + 1} abstimmen: ${currentCase.title}. Erst nach OK wird derselbe Fall für die nächste Stimme eingeblendet.`)
    : `${votedRoleName} hat bereits abgestimmt. ${isMultiplayerMode() ? `${nextRoleName} ist jetzt online dran.` : `Bitte gebt das Geraet jetzt an ${nextRoleName} weiter.`}`;
  changesEl.innerHTML = `<span class="value-change-item change-shift">${isMultiplayerMode() ? 'Nächste Online-Stimme' : 'Gerät weitergeben'}</span>`;

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

  if (isMultiplayerMode()) {
    const discardedQueuedVote = queuedMultiplayerVote;
    queuedMultiplayerVote = null;
    multiplayerQueueNotice = discardedQueuedVote
      ? 'Die alte Vormerkung wurde fuer die Stichwahl verworfen. Bitte waehle zwischen den verbleibenden Optionen neu.'
      : 'Die Stichwahl ist gestartet. Bitte waehle jetzt nur noch zwischen den verbleibenden Optionen.';
    publishOpenedPhase(`${detailText} ${multiplayerQueueNotice}`);
    return;
  }

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

  const lensName = isMultiplayerMode() ? '–' : state.selectedLens?.name ?? '–';

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
  currentPhaseStartedAt = null;
  timedPhaseKey = null;

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

  const currentPhaseKey = getCurrentVotePhaseKey();
  if (timedCaseIndex !== state.currentCase || timedPhaseKey !== currentPhaseKey || !currentPhaseStartedAt) {
    if (!isMultiplayerMode()) {
      markPhaseStarted();
    } else if (!currentPhaseStartedAt) {
      currentPhaseStartedAt = Date.now();
      timedCaseIndex = state.currentCase;
      timedPhaseKey = currentPhaseKey;
    }
  }

  timerRemaining = getSynchronizedTimerRemaining();
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timerRemaining = getSynchronizedTimerRemaining();
    updateTimerDisplay();
    if (timerRemaining <= 0) {
      clearTimer();
      if (isMultiplayerMode()) {
        handleMultiplayerTimeout(caseData);
        return;
      }
      autoDecide(caseData);
    }
  }, 1000);
}

function handleMultiplayerTimeout(caseData: typeof CASES[0]): void {
  const runtime = multiplayer;
  if (!runtime) {
    return;
  }

  if (!runtime.isHost) {
    setMultiplayerStatus('Beratungszeit abgelaufen. Warte auf die host-autoritative Fortschreibung oder synchronisiere kurz neu.');
    void runtime.requestStateSync();
    return;
  }

  ensureCouncilPreVote();
  const selectedRole = state.selectedRole;
  const fallbackDecision = getCurrentCouncilPreVote() ?? getAvailableDecisions(caseData)[0] ?? null;
  if (!selectedRole || !fallbackDecision) {
    setMultiplayerStatus('Beratungszeit abgelaufen, aber die Phase konnte nicht automatisch aufgelöst werden. Raum wird neu synchronisiert.');
    void runtime.requestStateSync();
    return;
  }

  runMultiplayerRequest({
    kind: 'vote',
    waitMessage: `Automatische Timeout-Stimme für ${selectedRole.name} hängt fest.`,
    request: () => runtime.resolveTimedOutVote({
      caseId: state.currentCase + 1,
      phaseKey: getCurrentVotePhaseKey(),
      roleId: selectedRole.id,
      optionId: fallbackDecision.id,
      isTieBreak: Boolean(state.tieBreakOptions),
    }),
    errorMessage: 'Die automatische Timeout-Stimme konnte nicht übertragen werden.',
  });
  setMultiplayerStatus(`Beratungszeit abgelaufen. ${selectedRole.name} wird automatisch mit „${fallbackDecision.text}“ gewertet.`);
  renderCase();
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

  const currentRoleId = state.selectedRole?.id ?? null;
  const queuedVote = getQueuedMultiplayerVote();
  const roundMetaText = isRoundSummaryActive()
    ? `Rundenabschluss bestätigt · ${getDisplayedRoundVoteCount()} / ${state.activeRoles.length}${state.tieBreakOptions ? ' · Stichwahl' : ''}`
    : `Stimmen in dieser Runde: ${getDisplayedRoundVoteCount()} / ${state.activeRoles.length}${state.tieBreakOptions ? ' · Stichwahl' : ''}`;

  const roleRoster = state.activeRoles
    .map((role) => {
      const isCurrentRole = role.id === currentRoleId;
      const isQueuedRole = queuedVote?.roleId === role.id;
      const isOwnedLocally = isLocalOwnedRole(role.id);
      const status = state.roundVotes[role.id]
        ? 'abgestimmt'
        : isQueuedRole
          ? 'vorgemerkt'
        : isCurrentRole
          ? 'ist am Zug'
          : 'wartet';
      const statusClass = state.roundVotes[role.id]
        ? 'voted'
        : isQueuedRole
          ? 'queued'
        : isCurrentRole
          ? 'current'
          : 'waiting';
      const queueMarkup = isQueuedRole && queuedVote
        ? `<div class="role-roster-queue-note">Vormerkung: ${queuedVote.optionText}</div>`
        : '';
      const ownerMarkup = isOwnedLocally
        ? '<span class="role-owner-badge">👑 Du</span>'
        : '';
      const abilityMarkup = isCurrentRole
        ? renderRoleAbilityInline(role, isAbilityAvailable(state))
        : '';
      return `
        <div class="role-roster-item ${statusClass}${isOwnedLocally ? ' own-role' : ''}">
          <div class="role-roster-avatar">${role.icon}</div>
          <div class="role-roster-content">
            <div class="role-roster-line">
              <span class="role-roster-name">${role.name}${ownerMarkup}</span>
              <span class="role-roster-status">${status}</span>
            </div>
            <div class="role-roster-perspective">${role.perspective}</div>
            ${queueMarkup}
            ${abilityMarkup}
          </div>
        </div>`;
    })
    .join('');

  el.innerHTML = `
    <div class="sidebar-round-summary">${roundMetaText}</div>
    <div class="role-roster">${roleRoster}</div>
  `;
}

function renderRoleAbilityInline(role: typeof ROLES[number], available: boolean): string {
  if (isRoundSummaryActive()) {
    return '<div class="role-ability-inline role-ability-inline-muted">Runde bereits entschieden.</div>';
  }

  if (isMultiplayerMode()) {
    return '<div class="role-ability-inline role-ability-inline-muted">Relay-Modus: Sonderfähigkeiten bleiben lokal deaktiviert.</div>';
  }

  if (role.id === 'sozialarbeiterin') {
    return '<div class="role-ability-inline role-ability-inline-passive">⭐ Passiv: Betroffene Gruppe wird pro Fall automatisch sichtbar.</div>';
  }

  const label = available ? '⭐ Sonderfähigkeit einsetzen' : '✓ Bereits genutzt';
  return `
    <div class="role-ability-inline">
      <button class="btn btn-secondary role-ability-button" onclick="triggerAbility()" ${available ? '' : 'disabled'}>
      ${label}
      </button>
      <div class="role-ability-copy">${role.abilityDescription}</div>
    </div>
  `;
}

// ============================================================
// SONDERFÄHIGKEIT
// ============================================================
function triggerAbility(): void {
  if (isMultiplayerMode()) {
    setMultiplayerStatus('Sonderfähigkeiten sind im Relay-Modus noch nicht synchronisiert.');
    return;
  }

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

function reopenGameIntro(): void {
  showScreen('screen-intro');
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
  if (isMultiplayerMode()) {
    window.location.href = window.location.href;
    return;
  }

  multiplayer?.destroy();
  multiplayer = null;
  state = createGame();
  clearTimer();
  timerRemaining = DECISION_TIMER_SECONDS;
  timedCaseIndex = null;
  timedPhaseKey = null;
  currentPhaseStartedAt = null;
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
    reopenGameIntro: typeof reopenGameIntro;
    triggerAbility: typeof triggerAbility;
    showEnding: typeof showEnding;
    showPaxEnding: typeof showPaxEnding;
    resetGame: typeof resetGame;
    startRelayHost: typeof startRelayHost;
    joinRelayGame: typeof joinRelayGame;
    requestMultiplayerSync: typeof requestMultiplayerSync;
  }
}

window.showScreen = showScreen;
window.startGame = startGame;
window.handleDecision = handleDecision;
window.closeConsequence = closeConsequence;
window.openValueInfo = openValueInfo;
window.openValuesOverview = openValuesOverview;
window.closeValueInfo = closeValueInfo;
window.reopenGameIntro = reopenGameIntro;
window.triggerAbility = triggerAbility;
window.showEnding = showEnding;
window.showPaxEnding = showPaxEnding;
window.resetGame = resetGame;
window.startRelayHost = startRelayHost;
window.joinRelayGame = joinRelayGame;
window.requestMultiplayerSync = requestMultiplayerSync;

// ============================================================
// INIT
// ============================================================
if (MULTIPLAYER_CONFIG) {
  multiplayer = new RelayMultiplayerRuntime({
    config: MULTIPLAYER_CONFIG,
    rulesVersion: MULTIPLAYER_RULES_VERSION,
    maxPlayers: ROLES.length,
    validRoleIds: ROLES.map((role) => role.id),
    getCurrentRoundId,
    getAuthoritativeState: () => state,
    getPhaseStartedAt: () => currentPhaseStartedAt,
    onRelayIssue: (message: string) => {
      setMultiplayerStatus(message);
      pushMultiplayerDebugEntry({
        channel: 'error',
        label: 'Relay-Hinweis',
        detail: message,
      });
    },
  });
  multiplayer.onEvent(handleMultiplayerTransportEvent);
  multiplayer.start();
}

initRolesScreen();
updateMultiplayerStatusUI();
showScreen(MULTIPLAYER_CONFIG ? 'screen-roles' : 'screen-start');
