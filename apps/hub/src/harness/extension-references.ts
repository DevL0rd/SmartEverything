import {
  ApiError,
  appendTo,
  sameHarnessGitOrigin,
  type ApiErrorCode,
  type HarnessDiscoveryReference,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { inspect, offered, sole, type Candidate } from './extension-inspect';
import {
  gitSourceOf,
  offerOrigin,
  withCheckout,
  type CheckedOutSource,
  type GitSource,
} from './extension-source';

export interface Located {
  readonly checkout: CheckedOutSource;
  readonly source: GitSource;
  readonly candidate: Candidate;
}

export type Settled<T> =
  | { readonly reference: HarnessDiscoveryReference; readonly ok: true; readonly value: T }
  | {
      readonly reference: HarnessDiscoveryReference;
      readonly ok: false;
      readonly error: { readonly code: ApiErrorCode; readonly message: string };
    };

export async function eachReference<T>(
  tmp: string,
  references: readonly HarnessDiscoveryReference[],
  work: (located: Located) => Promise<T>,
  log: Logger,
): Promise<readonly Settled<T>[]> {
  const groups = new Map<string, HarnessDiscoveryReference[]>();
  for (const reference of references) {
    appendTo(
      groups,
      JSON.stringify([gitSourceOf(reference.source), reference.snapshot]),
      reference,
    );
  }
  const settled = new Map<HarnessDiscoveryReference, Settled<T>>();
  for (const group of groups.values()) {
    for (const result of await settleGroup(tmp, group, work, log))
      settled.set(result.reference, result);
  }
  return references.flatMap((reference) => settled.get(reference) ?? []);
}

async function settleGroup<T>(
  tmp: string,
  group: readonly HarnessDiscoveryReference[],
  work: (located: Located) => Promise<T>,
  log: Logger,
): Promise<readonly Settled<T>[]> {
  const [first] = group;
  if (first === undefined) return [];
  const source = gitSourceOf(first.source);
  try {
    return await withCheckout(
      tmp,
      source,
      async (checkout) => {
        if (checkout.commit !== first.snapshot)
          throw new ApiError(
            'conflict',
            `The source is at ${checkout.commit}, not the discovered snapshot ${first.snapshot}.`,
            'snapshot_moved',
          );
        const candidates = await inspect(checkout, source.path);
        const results: Settled<T>[] = [];
        for (const reference of group)
          results.push(
            await settle(reference, log, async () =>
              followed(
                { checkout, source, candidate: candidateFor(candidates, reference, source) },
                work,
                tmp,
              ),
            ),
          );
        return results;
      },
      first.snapshot,
    );
  } catch (cause) {
    return group.map((reference) => failed(reference, cause, log));
  }
}

function candidateFor(
  candidates: readonly Candidate[],
  reference: HarnessDiscoveryReference,
  source: GitSource,
): Candidate {
  const { origin } = reference;
  const matchesOrigin =
    origin === undefined
      ? undefined
      : (candidate: Candidate): boolean =>
          sameHarnessGitOrigin(offerOrigin(source, candidate), origin);
  return offered(candidates, reference.id, matchesOrigin);
}

async function followed<T>(
  located: Located,
  work: (located: Located) => Promise<T>,
  tmp: string,
): Promise<T> {
  const linked = located.candidate.source;
  if (linked === undefined) return work(located);
  const source = gitSourceOf(linked);
  return withCheckout(tmp, source, async (checkout) =>
    work({ checkout, source, candidate: sole(await inspect(checkout, source.path)) }),
  );
}

async function settle<T>(
  reference: HarnessDiscoveryReference,
  log: Logger,
  run: () => Promise<T>,
): Promise<Settled<T>> {
  try {
    return { reference, ok: true, value: await run() };
  } catch (cause) {
    return failed(reference, cause, log);
  }
}

function failed<T>(reference: HarnessDiscoveryReference, cause: unknown, log: Logger): Settled<T> {
  if (cause instanceof ApiError)
    return { reference, ok: false, error: { code: cause.code, message: cause.message } };
  log.error('extensions.reference_failed', cause, { id: reference.id });
  return {
    reference,
    ok: false,
    error: { code: 'internal', message: cause instanceof Error ? cause.message : String(cause) },
  };
}
