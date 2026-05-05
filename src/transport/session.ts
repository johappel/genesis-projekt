import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import type { TransportClientInfo } from './types.js';

export interface EphemeralTransportSession {
  clientInfo: TransportClientInfo;
  secretKey: Uint8Array;
}

export function createEphemeralTransportSession(isHost: boolean): EphemeralTransportSession {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);

  return {
    clientInfo: {
      playerId: globalThis.crypto.randomUUID(),
      pubkey,
      isHost,
    },
    secretKey,
  };
}