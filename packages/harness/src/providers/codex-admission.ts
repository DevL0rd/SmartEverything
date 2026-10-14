import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CODEX_IDENTITY_CANDIDATE } from '../credentials/codex-identity';
import { SUBSCRIPTION_ROUTE_ID } from '../credentials/contracts';
import type { CodexSubscriptionCredential } from '../credentials/contracts';
import { assertCodexIdentityCandidate } from '../authorization/codex-identity';
import { SubscriptionProviderError } from './errors';

const MAX_PROOF_LIFETIME_MS = 30_000;
export const CODEX_ADMISSION_PROOF = z.strictObject({
  identityCandidate: CODEX_IDENTITY_CANDIDATE,
  routeId: SUBSCRIPTION_ROUTE_ID,
  accessVersion: z.string().regex(/^[a-f0-9]{64}$/),
  completedAt: z.number().int().positive(),
});
export type CodexAdmissionProof = z.infer<typeof CODEX_ADMISSION_PROOF>;

export function codexAccessVersion(access: string): string {
  return createHash('sha256').update(access).digest('hex');
}

export function assertCodexAdmission(
  credential: CodexSubscriptionCredential,
  proof: CodexAdmissionProof | undefined,
  expires: number,
  startedAt: number,
): void {
  const candidate = assertCodexIdentityCandidate(
    credential.access,
    credential.accountId,
    credential.identityCandidate,
  );
  if (
    proof?.identityCandidate.accountId !== candidate.accountId ||
    proof.identityCandidate.userId !== candidate.userId ||
    proof.routeId !== credential.routeId ||
    proof.accessVersion !== codexAccessVersion(credential.access) ||
    !codexProofIsFresh(proof, expires, credential.expires, startedAt)
  )
    throw new SubscriptionProviderError(
      'PLAN_ONLY_UNVERIFIED',
      'Codex admission requires fresh authenticated usage for this own credential, account, user and route.',
    );
}

function codexProofIsFresh(
  proof: CodexAdmissionProof,
  expires: number,
  credentialExpires: number,
  startedAt: number,
): boolean {
  return (
    proof.completedAt >= startedAt &&
    proof.completedAt <= Date.now() &&
    proof.completedAt < expires &&
    expires <= credentialExpires &&
    expires <= proof.completedAt + MAX_PROOF_LIFETIME_MS
  );
}
