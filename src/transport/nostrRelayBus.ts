import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools/pure';
import type { Event as NostrEvent, EventTemplate } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';

import { MULTIPLAYER_TUNING } from './config.js';
import type { TransportEvent, TransportMessageBus } from './types.js';
import type { EphemeralTransportSession } from './session.js';

export const GENESIS_TRANSPORT_KIND = 1;

const PUBLISH_RETRY_ATTEMPTS = MULTIPLAYER_TUNING.publishRetryAttempts;
const PUBLISH_RETRY_DELAY_MS = MULTIPLAYER_TUNING.publishRetryDelayMs;
const SUBSCRIPTION_RETRY_DELAY_MS = MULTIPLAYER_TUNING.subscriptionRetryDelayMs;

export interface NostrRelayBusOptions {
  relayUrls: string[];
  session: EphemeralTransportSession;
  onConnectionIssue?: (details: { relayUrls: string[]; reason?: string }) => void;
}

export function toRelayWebSocketUrl(relayUrl: string): string {
  if (relayUrl.startsWith('ws://') || relayUrl.startsWith('wss://')) {
    return relayUrl;
  }

  if (relayUrl.startsWith('https://')) {
    return relayUrl.replace(/^https:\/\//, 'wss://');
  }

  if (relayUrl.startsWith('http://')) {
    return relayUrl.replace(/^http:\/\//, 'ws://');
  }

  return `ws://${relayUrl}`;
}

function formatCloseReason(reason: unknown): string | null {
  if (Array.isArray(reason)) {
    const parts = reason
      .map((entry) => formatCloseReason(entry))
      .filter((entry): entry is string => Boolean(entry));
    return parts.length ? parts.join('; ') : null;
  }

  if (reason instanceof Error) {
    return reason.message.trim() || null;
  }

  if (typeof reason === 'string') {
    const trimmed = reason.trim();
    return trimmed || null;
  }

  if (reason && typeof reason === 'object') {
    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  }

  if (typeof reason === 'number' || typeof reason === 'boolean') {
    return String(reason);
  }

  return null;
}

export class NostrRelayBus implements TransportMessageBus {
  private readonly pool = new SimplePool({
    enablePing: true,
    enableReconnect: true,
  });

  private readonly options: NostrRelayBusOptions;

  private readonly relayUrls: string[];

  constructor(options: NostrRelayBusOptions) {
    this.options = options;
    this.relayUrls = options.relayUrls.map(toRelayWebSocketUrl);
  }

  async publish(event: TransportEvent): Promise<void> {
    const normalizedEvent = {
      ...event,
      actorPubkey: this.options.session.clientInfo.pubkey,
    } satisfies TransportEvent;

    const template: EventTemplate = {
      kind: GENESIS_TRANSPORT_KIND,
      created_at: Math.floor(normalizedEvent.sentAt / 1000),
      tags: [
        ['g', normalizedEvent.gameId],
        ['r', normalizedEvent.roundId],
        ['p', normalizedEvent.playerId],
        ['t', normalizedEvent.eventName],
        ['d', `${normalizedEvent.gameId}:${normalizedEvent.playerId}:${normalizedEvent.seq}`],
        ['x', 'genesis-transport-v1'],
      ],
      content: JSON.stringify(normalizedEvent),
    };

    const signedEvent = finalizeEvent(template, this.options.session.secretKey);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < PUBLISH_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await Promise.any(this.pool.publish(this.relayUrls, signedEvent));
        return;
      } catch (error: unknown) {
        lastError = error;
        if (attempt === PUBLISH_RETRY_ATTEMPTS - 1) {
          throw error;
        }

        await delay(PUBLISH_RETRY_DELAY_MS);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Relay-Publish fehlgeschlagen');
  }

  subscribe(gameId: string, onEvent: (event: TransportEvent) => void): () => void {
    const filter: Filter = {
      kinds: [GENESIS_TRANSPORT_KIND],
      '#g': [gameId],
    };

    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { close(reason?: string): void } | null = null;

    const openSubscription = (): void => {
      subscription = this.pool.subscribe(this.relayUrls, filter, {
        onevent: (event) => {
          const parsedEvent = parseTransportEvent(event);
          if (!parsedEvent || parsedEvent.gameId !== gameId) {
            return;
          }

          onEvent(parsedEvent);
        },
        onclose: (reason) => {
          const normalizedReason = formatCloseReason(reason) ?? undefined;
          if (closed) {
            return;
          }

          if (normalizedReason && normalizedReason.toLowerCase() === 'unsubscribe') {
            return;
          }

          this.options.onConnectionIssue?.({
            relayUrls: this.relayUrls,
            reason: normalizedReason,
          });

          if (retryTimer !== null) {
            clearTimeout(retryTimer);
          }

          retryTimer = setTimeout(() => {
            if (!closed) {
              openSubscription();
            }
          }, SUBSCRIPTION_RETRY_DELAY_MS);
        },
      });
    };

    openSubscription();

    return () => {
      closed = true;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
      subscription?.close('unsubscribe');
    };
  }

  destroy(): void {
    this.pool.destroy();
  }
}

function parseTransportEvent(event: NostrEvent): TransportEvent | null {
  try {
    const parsed = JSON.parse(event.content) as TransportEvent;
    return parsed.actorPubkey === event.pubkey
      ? {
          ...parsed,
          messageId: event.id,
        }
      : null;
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}