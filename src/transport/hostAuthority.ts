import { TransportEventFactory } from './eventFactory.js';
import type { EphemeralTransportSession } from './session.js';
import type { RoleClaimedEvent, StateSnapshot, TransportMessageBus } from './types.js';

export interface HostAuthorityOptions {
  bus: TransportMessageBus;
  gameId: string;
  session: EphemeralTransportSession;
  rulesVersion: string;
  maxPlayers: number;
  validRoleIds: string[];
  getCurrentRoundId: () => string;
  getAuthoritativeSnapshot: () => StateSnapshot;
}

export class HostAuthority {
  private readonly bus: TransportMessageBus;

  private readonly gameId: string;

  private readonly rulesVersion: string;

  private readonly maxPlayers: number;

  private readonly validRoleIds: Set<string>;

  private readonly getCurrentRoundId: () => string;

  private readonly getAuthoritativeSnapshot: () => StateSnapshot;

  private readonly eventFactory: TransportEventFactory;

  private readonly acceptedRoleOwners: Record<string, string> = {};

  private unsubscribe: (() => void) | null = null;

  constructor(options: HostAuthorityOptions) {
    this.bus = options.bus;
    this.gameId = options.gameId;
    this.rulesVersion = options.rulesVersion;
    this.maxPlayers = options.maxPlayers;
    this.validRoleIds = new Set(options.validRoleIds);
    this.getCurrentRoundId = options.getCurrentRoundId;
    this.getAuthoritativeSnapshot = options.getAuthoritativeSnapshot;
    this.eventFactory = new TransportEventFactory({
      gameId: options.gameId,
      clientInfo: options.session.clientInfo,
    });
  }

  start(): void {
    if (this.unsubscribe) {
      return;
    }

    this.unsubscribe = this.bus.subscribe(this.gameId, (event) => {
      if (event.eventName === 'state-sync-requested') {
        if (event.requestedByPlayerId !== event.playerId) {
          return;
        }

        const response = this.eventFactory.createStateSyncSent({
          roundId: this.getCurrentRoundId(),
          snapshot: this.getMergedSnapshot(),
        });
        void this.bus.publish(response);
        return;
      }

      if (event.eventName === 'role-claimed' && event.claimStatus === 'requested') {
        void this.handleRoleClaimRequested(event);
      }
    });
  }

  async publishGameCreated(): Promise<void> {
    const event = this.eventFactory.createGameCreated({
      roundId: this.getCurrentRoundId(),
      rulesVersion: this.rulesVersion,
      maxPlayers: this.maxPlayers,
    });
    await this.bus.publish(event);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private getMergedSnapshot(): StateSnapshot {
    const snapshot = this.getAuthoritativeSnapshot();
    return {
      ...snapshot,
      roleOwners: {
        ...snapshot.roleOwners,
        ...this.acceptedRoleOwners,
      },
    };
  }

  private async handleRoleClaimRequested(event: RoleClaimedEvent): Promise<void> {
    const resolution = this.resolveRoleClaim(event);
    const response = this.eventFactory.createRoleClaimResolved({
      roundId: this.getCurrentRoundId(),
      roleId: event.roleId,
      claimedByPlayerId: event.claimedByPlayerId,
      claimStatus: resolution.claimStatus,
      rejectionReason: resolution.rejectionReason,
    });

    await this.bus.publish(response);
  }

  private resolveRoleClaim(event: RoleClaimedEvent): {
    claimStatus: 'accepted' | 'rejected';
    rejectionReason?: RoleClaimedEvent['rejectionReason'];
  } {
    if (event.claimedByPlayerId !== event.playerId) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'PLAYER_ALREADY_HAS_ROLE',
      };
    }

    if (!this.validRoleIds.has(event.roleId)) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'ROLE_NOT_FOUND',
      };
    }

    const currentOwners = this.getMergedSnapshot().roleOwners;
    const alreadyOwnedRole = Object.entries(currentOwners).find(([, playerId]) => playerId === event.claimedByPlayerId);
    if (alreadyOwnedRole && alreadyOwnedRole[0] !== event.roleId) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'PLAYER_ALREADY_HAS_ROLE',
      };
    }

    if (!currentOwners[event.roleId] && Object.keys(currentOwners).length >= Math.min(this.maxPlayers, this.validRoleIds.size)) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'GAME_FULL',
      };
    }

    if (currentOwners[event.roleId] && currentOwners[event.roleId] !== event.claimedByPlayerId) {
      return {
        claimStatus: 'rejected',
        rejectionReason: 'ROLE_ALREADY_TAKEN',
      };
    }

    this.acceptedRoleOwners[event.roleId] = event.claimedByPlayerId;
    return {
      claimStatus: 'accepted',
    };
  }
}