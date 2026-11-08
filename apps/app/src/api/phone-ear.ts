import {
  API_ENDPOINTS as E,
  type ListeningClaimAnswer,
  type ListeningConfig,
  type ListeningRuntimeState,
  type ListeningSource,
  type ListeningWakeClaim,
} from '@smarteverything/domain';
import { api } from './transport';

export async function readPhoneEarConfig(): Promise<ListeningConfig> {
  return api().call(E.readPhoneListeningConfig, {});
}

export async function claimPhoneWake(claim: ListeningWakeClaim): Promise<ListeningClaimAnswer> {
  return api().call(E.claimPhoneWake, { body: claim });
}

export async function reportPhoneEarState(state: ListeningRuntimeState | null): Promise<void> {
  await api().call(E.reportPhoneListening, { body: { kind: 'state', state } });
}

export async function readListeningSources(): Promise<readonly ListeningSource[]> {
  const view = await api().call(E.readListening, {});
  return view.sources;
}
