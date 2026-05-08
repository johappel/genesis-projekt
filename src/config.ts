export const MULTIPLAYER_DEFAULTS = {
  relayUrls: [
        "wss://relay.damus.io",
        "wss://eden.nostr.land",
        "wss://nos.lol",
        "wss://nostr-pub.wellorder.net",
        "wss://nostr.wine",
        "wss://nostr.bitcoiner.social",
        "wss://relay.primal.net"
    ] as string[],
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
