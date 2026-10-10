import { randomUUID } from 'node:crypto';
import {
  MCP_CONSENT_ACCESS,
  MCP_CONSENT_REQUEST,
  type McpConsentOutcome,
  type McpConsentRequest,
} from '@smarteverything/domain';
import type { Cancel, Clock } from '../../../clock';
import type { LiveNotice } from '../../../server/live';

export interface Settlement {
  readonly outcome: McpConsentOutcome;
  readonly location: string | null;
}

export type Waiter = (settlement: Settlement) => void;

export interface ConsentOpening {
  readonly pageId: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly clientUri: string | null;
  readonly expiresAt: number;
  readonly expiredLocation: string;
}

interface Consent {
  readonly request: McpConsentRequest;
  readonly clientId: string;
  readonly expiredLocation: string;
  readonly waiters: Set<Waiter>;
  readonly cancelExpiry: Cancel;
  settlement: Settlement | null;
}

export interface ConsentSignals {
  readonly announce: (notice: LiveNotice) => void;
  readonly requested: (request: McpConsentRequest) => void;
}

export class PendingConsents {
  private readonly consents = new Map<string, Consent>();

  constructor(
    private readonly clock: Clock,
    private readonly signals: ConsentSignals,
  ) {}

  open(opening: ConsentOpening): readonly string[] {
    const replaced = [...this.consents]
      .filter(([, consent]) => consent.clientId === opening.clientId && consent.settlement === null)
      .map(([pageId]) => pageId);
    for (const pageId of replaced) {
      this.settle(pageId, { outcome: 'cancelled', location: null });
    }
    const request = MCP_CONSENT_REQUEST.parse({
      id: randomUUID(),
      clientName: opening.clientName,
      clientUri: opening.clientUri,
      access: MCP_CONSENT_ACCESS,
      requestedAt: this.clock.now().toISOString(),
      expiresAt: new Date(opening.expiresAt).toISOString(),
    });
    this.consents.set(opening.pageId, {
      request,
      clientId: opening.clientId,
      expiredLocation: opening.expiredLocation,
      waiters: new Set(),
      cancelExpiry: this.clock.at(new Date(opening.expiresAt), () => {
        this.expire(opening.pageId);
      }),
      settlement: null,
    });
    this.signals.announce({ type: 'mcp_consent', request });
    this.signals.requested(request);
    return replaced;
  }

  waiting(): McpConsentRequest[] {
    return [...this.consents.values()]
      .filter((consent) => consent.settlement === null)
      .map((consent) => consent.request)
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  }

  pageOf(consentId: string): string | undefined {
    for (const [pageId, consent] of this.consents) {
      if (consent.request.id === consentId && consent.settlement === null) {
        return pageId;
      }
    }
    return undefined;
  }

  settlementOf(pageId: string): Settlement | null | undefined {
    return this.consents.get(pageId)?.settlement;
  }

  wait(pageId: string, waiter: Waiter): () => void {
    const consent = this.consents.get(pageId);
    consent?.waiters.add(waiter);
    return () => {
      consent?.waiters.delete(waiter);
    };
  }

  settle(pageId: string, settlement: Settlement): void {
    const consent = this.consents.get(pageId);
    if (consent?.settlement !== null) {
      return;
    }
    consent.settlement = settlement;
    this.signals.announce({
      type: 'mcp_consent_closed',
      id: consent.request.id,
      outcome: settlement.outcome,
    });
    for (const waiter of consent.waiters) {
      waiter(settlement);
    }
    consent.waiters.clear();
  }

  expire(pageId: string): void {
    const consent = this.consents.get(pageId);
    if (consent !== undefined) {
      consent.cancelExpiry();
      this.settle(pageId, { outcome: 'expired', location: consent.expiredLocation });
    }
    this.consents.delete(pageId);
  }

  stop(): void {
    for (const consent of this.consents.values()) {
      consent.cancelExpiry();
    }
    this.consents.clear();
  }
}
