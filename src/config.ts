export const MULTIPLAYER_DEFAULTS = {
  relayUrl: 'ws://relay.nostr.net/',
  roomCodePrefix: 'genesis',
} as const;

export const MULTIPLAYER_TUNING = {
  initialStateSyncDelayMs: 80,
  recoveryTimeoutMs: 900,
  publishRetryAttempts: 4,
  publishRetryDelayMs: 80,
  subscriptionRetryDelayMs: 150,
  followupStateSyncEnabled: true,
  followupStateSyncDelayMs: 45,
} as const;
