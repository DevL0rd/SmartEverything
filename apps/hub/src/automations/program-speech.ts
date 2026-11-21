import { ApiError } from '@smarteverything/domain';
import type { HostStore } from '../store/host/host-store';
import type { SpeechPrincipal } from '../transcripts/speech-principal';

export type SpeechPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'remove'; readonly principal: SpeechPrincipal }
  | { readonly kind: 'bind'; readonly principal: SpeechPrincipal; readonly bound: SpeechPrincipal };

interface Saved {
  readonly id: string;
  readonly revision: number;
}

export function requireSamePrincipal(
  prior: SpeechPrincipal | null,
  principal: SpeechPrincipal,
): void {
  if (prior === null) return;
  if (prior.profileId === principal.profileId && prior.role === principal.role) return;
  throw new ApiError(
    'forbidden',
    'Only the initiating profile may change or reauthorize this speech automation.',
  );
}

export function priorSpeech(
  store: Pick<HostStore, 'speech'>,
  id: string | undefined,
): SpeechPrincipal | null {
  if (id === undefined) return null;
  const grant = store.speech.grant(id);
  return grant === undefined ? null : grant.principal;
}

export function applySpeech(
  store: Pick<HostStore, 'speech'>,
  saved: Saved,
  plan: SpeechPlan,
): void {
  const prior = priorSpeech(store, saved.id);
  if (plan.kind === 'none') {
    if (prior === null) return;
    throw new ApiError(
      'conflict',
      'The speech trigger of the automation changed since it was read. Reload it and save again.',
    );
  }
  requireSamePrincipal(prior, plan.principal);
  if (plan.kind === 'bind') store.speech.save(saved.id, String(saved.revision), plan.bound);
  else if (prior !== null) store.speech.remove(saved.id);
}
