import { CLAUDE_ACCOUNT_IDENTITY } from '../credentials/contracts';
import type { SubscriptionCredential } from '../credentials/contracts';
import { SubscriptionProviderError } from './errors';
import { z } from 'zod';
import { CODEX_ADMISSION_PROOF, assertCodexAdmission } from './codex-admission';
import { CODEX_IDENTITY_CANDIDATE } from '../credentials/codex-identity';

const PLAN_ONLY_ADMISSION = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('unavailable'), reason: z.string().min(1).max(1000) }),
  z.strictObject({
    state: z.literal('verified'),
    provider: z.enum(['claude-subscription', 'chatgpt-subscription', 'codex-subscription']),
    generation: z.uuid(),
    hostId: z.uuid(),
    expires: z.number().int().positive(),
    evidence: z.string().min(1).max(2000),
    identity: CLAUDE_ACCOUNT_IDENTITY.optional(),
    codexProof: CODEX_ADMISSION_PROOF.optional(),
  }),
]);
export type PlanOnlyAdmission = z.infer<typeof PLAN_ONLY_ADMISSION>;
const PLAN_ONLY_ADMISSION_READER = z.discriminatedUnion('state', [
  PLAN_ONLY_ADMISSION.options[0].strip(),
  PLAN_ONLY_ADMISSION.options[1].strip().extend({
    identity: CLAUDE_ACCOUNT_IDENTITY.strip().optional(),
    codexProof: CODEX_ADMISSION_PROOF.strip()
      .extend({
        identityCandidate: CODEX_IDENTITY_CANDIDATE.strip(),
      })
      .optional(),
  }),
]);

export interface SubscriptionAdmissionPort {
  verify(credential: SubscriptionCredential, signal: AbortSignal): Promise<PlanOnlyAdmission>;
}

export const unavailableSubscriptionAdmission: SubscriptionAdmissionPort = {
  verify: () =>
    Promise.resolve({
      state: 'unavailable',
      reason:
        'Provider does not expose a verified plan-only admission contract that prevents credits or paid extra usage.',
    }),
};

export async function assertPlanOnlyAdmission(
  port: SubscriptionAdmissionPort,
  credential: SubscriptionCredential,
  signal: AbortSignal,
): Promise<Extract<PlanOnlyAdmission, { state: 'verified' }>> {
  const startedAt = Date.now();
  signal.throwIfAborted();
  const admission = PLAN_ONLY_ADMISSION_READER.parse(await port.verify(credential, signal));
  signal.throwIfAborted();
  if (admission.state === 'unavailable')
    throw new SubscriptionProviderError('PLAN_ONLY_UNVERIFIED', admission.reason);
  assertAdmissionIdentity(credential, admission);
  if (credential.kind === 'codex-subscription')
    assertCodexAdmission(credential, admission.codexProof, admission.expires, startedAt);
  if (
    admission.provider !== credential.kind ||
    admission.generation !== credential.generation ||
    admission.hostId !== credential.hostId ||
    admission.expires <= Date.now() ||
    admission.evidence.trim() === ''
  )
    throw new SubscriptionProviderError(
      'PLAN_ONLY_UNVERIFIED',
      'Plan-only admission proof does not cover this account, supplying host and request.',
    );
  return admission;
}

function assertAdmissionIdentity(
  credential: SubscriptionCredential,
  admission: Extract<PlanOnlyAdmission, { state: 'verified' }>,
): void {
  if (credential.kind !== 'claude-subscription') return;
  if (
    credential.identity === undefined ||
    credential.identity.accountId !== admission.identity?.accountId ||
    credential.identity.organizationId !== admission.identity.organizationId
  )
    throw new SubscriptionProviderError(
      'PLAN_ONLY_UNVERIFIED',
      'Claude admission proof does not cover the enrolled account and organization.',
    );
}
