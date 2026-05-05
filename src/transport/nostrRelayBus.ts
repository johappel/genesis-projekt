import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools/pure';
import type { Event as NostrEvent, EventTemplate } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';

import type { TransportEvent, TransportMessageBus } from './types.js';
import type { EphemeralTransportSession } from './session.js';

export const GENESIS_TRANSPORT_KIND = 24444;

export interface NostrRelayBusOptions {
  relayUrls: string[];
  session: EphemeralTransportSession;
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
    await Promise.any(this.pool.publish(this.relayUrls, signedEvent));
  }

  subscribe(gameId: string, onEvent: (event: TransportEvent) => void): () => void {
    const filter: Filter = {
      kinds: [GENESIS_TRANSPORT_KIND],
      '#g': [gameId],
    };

    const subscription = this.pool.subscribe(this.relayUrls, filter, {
      onevent: (event) => {
        const parsedEvent = parseTransportEvent(event);
        if (!parsedEvent || parsedEvent.gameId !== gameId) {
          return;
        }

        onEvent(parsedEvent);
      },
    });

    return () => subscription.close('unsubscribe');
  }

  destroy(): void {
    this.pool.destroy();
  }
}

function parseTransportEvent(event: NostrEvent): TransportEvent | null {
  try {
    const parsed = JSON.parse(event.content) as TransportEvent;
    return parsed.actorPubkey === event.pubkey ? parsed : null;
  } catch {
    return null;
  }
}