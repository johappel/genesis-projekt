import { describe, expect, it } from 'vitest';
import { GAMEPLAY_TIMING, readGameplayTimingConfig } from '../src/game/config.js';

describe('readGameplayTimingConfig()', () => {
  it('verwendet standardwerte ohne url-parameter', () => {
    expect(readGameplayTimingConfig('')).toEqual(GAMEPLAY_TIMING);
  });

  it('wendet ein timing-preset an', () => {
    expect(readGameplayTimingConfig('?timingPreset=kurz')).toEqual({
      decisionTimerSeconds: 60,
      lensSelectionBonusSeconds: 8,
    });
  });

  it('lässt explizite url-werte ein preset überschreiben', () => {
    expect(readGameplayTimingConfig('?timingPreset=lang&timer=75&lensBonus=11')).toEqual({
      decisionTimerSeconds: 75,
      lensSelectionBonusSeconds: 11,
    });
  });
});