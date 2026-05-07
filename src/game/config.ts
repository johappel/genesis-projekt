export type GameplayTimingConfig = {
  decisionTimerSeconds: number;
  lensSelectionBonusSeconds: number;
};

export const GAMEPLAY_TIMING: GameplayTimingConfig = {
  decisionTimerSeconds: 90,
  lensSelectionBonusSeconds: 12,
};

const GAMEPLAY_TIMING_PRESETS: Record<string, GameplayTimingConfig> = {
  kurz: {
    decisionTimerSeconds: 60,
    lensSelectionBonusSeconds: 8,
  },
  standard: GAMEPLAY_TIMING,
  lang: {
    decisionTimerSeconds: 120,
    lensSelectionBonusSeconds: 15,
  },
};

function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function readGameplayTimingConfig(search: string | URLSearchParams): GameplayTimingConfig {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const presetKey = (params.get('timingPreset') ?? params.get('timing') ?? 'standard').toLowerCase();
  const preset = GAMEPLAY_TIMING_PRESETS[presetKey] ?? GAMEPLAY_TIMING_PRESETS.standard;
  const decisionTimerSeconds = parsePositiveInteger(params.get('decisionTimerSeconds') ?? params.get('timer')) ?? preset.decisionTimerSeconds;
  const lensSelectionBonusSeconds = parsePositiveInteger(params.get('lensSelectionBonusSeconds') ?? params.get('lensBonus')) ?? preset.lensSelectionBonusSeconds;

  return {
    decisionTimerSeconds,
    lensSelectionBonusSeconds,
  };
}