import { candidateOf, type TvCandidate } from '@smarteverything/smartthings';
import type { Logger } from '@smarteverything/logging';
import { failureLine } from '@smarteverything/logging';
import type { SamsungTvIo } from './io';
import { readTvInfo } from './link';
import type { SsdpSearch } from './ssdp';

export async function findCandidates(
  io: SamsungTvIo,
  search: SsdpSearch,
  deviceModel: string,
  log: Logger,
): Promise<TvCandidate[]> {
  const hosts = await search();
  const found = await Promise.all(
    hosts.map(async (host): Promise<TvCandidate | null> => {
      try {
        return candidateOf(host, await readTvInfo(io, host), deviceModel);
      } catch (cause) {
        log.debug('television.candidate_unreadable', () => ({ host, reason: failureLine(cause) }));
        return null;
      }
    }),
  );
  return found
    .filter((candidate): candidate is TvCandidate => candidate !== null)
    .sort((left, right) => Number(right.likely) - Number(left.likely));
}
