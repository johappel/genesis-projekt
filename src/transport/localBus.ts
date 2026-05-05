import type { TransportEvent, TransportMessageBus } from './types.js';

type EventListener = (event: TransportEvent) => void;

const listenersByGameId = new Map<string, Set<EventListener>>();

export class LocalBus implements TransportMessageBus {
  async publish(event: TransportEvent): Promise<void> {
    const listeners = listenersByGameId.get(event.gameId);
    if (!listeners?.size) {
      return;
    }

    queueMicrotask(() => {
      for (const listener of listeners) {
        listener(event);
      }
    });
  }

  subscribe(gameId: string, onEvent: (event: TransportEvent) => void): () => void {
    const listeners = listenersByGameId.get(gameId) ?? new Set<EventListener>();
    listeners.add(onEvent);
    listenersByGameId.set(gameId, listeners);

    return () => {
      const activeListeners = listenersByGameId.get(gameId);
      if (!activeListeners) {
        return;
      }

      activeListeners.delete(onEvent);
      if (!activeListeners.size) {
        listenersByGameId.delete(gameId);
      }
    };
  }

  destroy(): void {
    listenersByGameId.clear();
  }
}