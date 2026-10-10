import { randomInt } from 'node:crypto';
import {
  CLIENT_TOKEN,
  MCP_APPROVAL_CODE,
  hashClientToken,
  type McpApprovalCode,
} from '@smarteverything/domain';
import type { Clock } from '../../../clock';
import type { Store } from '../../../store/store';
import { hashSecret, sameHash } from '../secrets';

const APPROVAL_CODE_LIFETIME_MS = 10 * 60_000;

const APPROVAL_ATTEMPTS = 5;

const CODE_SPACE = 1_000_000;

export type ApprovalOutcome =
  { readonly approved: true } | { readonly approved: false; readonly reason: string };

interface Current {
  readonly hash: string;
  readonly expiresAt: number;
  failures: number;
}

export class ApprovalCodes {
  private current: Current | null = null;

  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
  ) {}

  issue(): McpApprovalCode {
    const code = String(randomInt(CODE_SPACE)).padStart(6, '0');
    const expiresAt = this.clock.now().getTime() + APPROVAL_CODE_LIFETIME_MS;
    this.current = { hash: hashSecret(code), expiresAt, failures: 0 };
    return MCP_APPROVAL_CODE.parse({ code, expiresAt: new Date(expiresAt).toISOString() });
  }

  check(answer: string): ApprovalOutcome {
    const trimmed = answer.trim();
    if (trimmed === '') {
      return { approved: false, reason: 'Type the approval code the desktop app shows.' };
    }
    if (CLIENT_TOKEN.safeParse(trimmed).success) {
      return this.ownerToken(trimmed);
    }
    return this.code(trimmed.replace(/\s+/g, ''));
  }

  private ownerToken(token: string): ApprovalOutcome {
    const client = this.store.clients.byTokenHash(hashClientToken(token));
    if (client?.role !== 'owner') {
      return { approved: false, reason: 'That is not the token of an owner of this home.' };
    }
    return { approved: true };
  }

  private code(code: string): ApprovalOutcome {
    const current = this.current;
    if (current === null || current.expiresAt <= this.clock.now().getTime()) {
      this.current = null;
      return {
        approved: false,
        reason:
          'No approval code is waiting. Open Settings → AI assistants in the SmartEverything desktop app and choose Show a code.',
      };
    }
    if (sameHash(hashSecret(code), current.hash)) {
      this.current = null;
      return { approved: true };
    }
    current.failures += 1;
    if (current.failures >= APPROVAL_ATTEMPTS) {
      this.current = null;
      return {
        approved: false,
        reason:
          'That code is wrong, and it has now been discarded after too many tries. Show a new one in the desktop app.',
      };
    }
    return { approved: false, reason: 'That code is wrong. Check the code the desktop app shows.' };
  }
}
