import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';

import type { TransportClientInfo } from './types.js';

export interface EphemeralTransportSession {
  clientInfo: TransportClientInfo;
  secretKey: Uint8Array;
}

type PersistedTransportSession = {
  playerId: string;
  secretKeyHex: string;
  isHost: boolean;
};

export function createEphemeralTransportSession(
  isHost: boolean,
  persistenceKey?: string,
): EphemeralTransportSession {
  const persistedSession = persistenceKey && shouldReusePersistedSession()
    ? readPersistedSession(persistenceKey)
    : null;
  const secretKey = persistedSession ? hexToBytes(persistedSession.secretKeyHex) : generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const playerId = persistedSession?.playerId ?? globalThis.crypto.randomUUID();

  if (persistenceKey) {
    persistSession(persistenceKey, {
      playerId,
      secretKeyHex: bytesToHex(secretKey),
      isHost,
    });
  }

  return {
    clientInfo: {
      playerId,
      pubkey,
      isHost,
    },
    secretKey,
  };
}

function shouldReusePersistedSession(): boolean {
  const navigationType = readNavigationType();
  return navigationType === 'reload' || navigationType === 'back_forward';
}

function getSessionStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readNavigationType(): string {
  try {
    const performanceApi = globalThis.performance;
    if (!performanceApi || typeof performanceApi.getEntriesByType !== 'function') {
      return '';
    }

    const entries = performanceApi.getEntriesByType('navigation') as Array<{ type?: string }>;
    return entries[0]?.type ?? '';
  } catch {
    return '';
  }
}

function readPersistedSession(persistenceKey: string): PersistedTransportSession | null {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  const rawValue = storage.getItem(persistenceKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PersistedTransportSession;
    return parsed.playerId && parsed.secretKeyHex ? parsed : null;
  } catch {
    storage.removeItem(persistenceKey);
    return null;
  }
}

function persistSession(persistenceKey: string, session: PersistedTransportSession): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.setItem(persistenceKey, JSON.stringify(session));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized || normalized.length % 2 !== 0) {
    throw new Error('Ungültiger Session-Schlüssel im Speicher.');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}