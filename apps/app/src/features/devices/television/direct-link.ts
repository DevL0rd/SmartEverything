import type {
  API_ENDPOINTS,
  ProviderProblem,
  TelevisionSettingsRow,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { ProgressStep } from '../../../components/progress-steps';
import type { LinkStage } from '../../connections';

type TelevisionCandidate = z.infer<typeof API_ENDPOINTS.listTelevisionCandidates.response>[number];

export interface DirectAddress {
  readonly host: string;
  readonly mac: string;
}

export function directAddressOf(row: TelevisionSettingsRow | null): DirectAddress | null {
  const host = row?.direct_host ?? null;
  const mac = row?.direct_mac ?? null;
  return host === null || mac === null ? null : { host, mac: mac.toUpperCase() };
}

export interface FoundScreen {
  readonly host: string;
  readonly name: string;
  readonly detail: string;
  readonly note: string | null;
}

function noteOf(linkedTo: string | null, deviceId: string): string | null {
  if (linkedTo === null) {
    return null;
  }
  return linkedTo === deviceId
    ? 'Linked to this screen now'
    : 'Linked to another screen in the app, picking it moves the link here';
}

export function foundScreens(
  candidates: readonly TelevisionCandidate[],
  deviceId: string,
): readonly FoundScreen[] {
  return candidates.flatMap((candidate) =>
    candidate.macAddress === null
      ? []
      : [
          {
            host: candidate.host,
            name: candidate.name,
            detail: [candidate.model, candidate.host, candidate.macAddress.toUpperCase()]
              .filter((part) => part !== null)
              .join(' · '),
            note: noteOf(candidate.linkedTo, deviceId),
          },
        ],
  );
}

export type LinkProgress =
  | { readonly kind: 'pick' }
  | { readonly kind: 'working'; readonly steps: readonly ProgressStep[] }
  | { readonly kind: 'linked' }
  | { readonly kind: 'failed'; readonly title: string; readonly detail: string | null };

const FAILURE_TITLE: Readonly<Record<ProviderProblem, string>> = {
  bad_credentials: 'The screen said no, or nobody chose Allow in time',
  permission_denied: 'The screen said no, or nobody chose Allow in time',
  network: 'The hub could not reach the screen. Keep it on and on the same network as the hub',
  session_expired: 'The screen did not finish linking',
  qr_expired: 'The screen did not finish linking',
  cancelled: 'Linking was stopped',
  rate_limited: 'The screen is busy, try again in a minute',
  not_supported: 'This screen cannot be linked directly',
  unknown: 'The screen was not linked',
};

function stepsOf(asking: boolean): readonly ProgressStep[] {
  return [
    { label: 'Reaching the screen', state: asking ? 'done' : 'active' },
    {
      label: 'Choose Allow on the screen',
      state: asking ? 'active' : 'waiting',
      detail: 'SmartEverything asks to connect, answer it with the TV remote',
    },
  ];
}

export function linkProgressOf(stage: LinkStage): LinkProgress {
  switch (stage.kind) {
    case 'form':
      return { kind: 'pick' };
    case 'working':
      return { kind: 'working', steps: stepsOf(false) };
    case 'prompt':
      return { kind: 'working', steps: stepsOf(true) };
    case 'done':
      return { kind: 'linked' };
    case 'failed':
      return { kind: 'failed', title: FAILURE_TITLE[stage.problem], detail: stage.detail };
  }
}
