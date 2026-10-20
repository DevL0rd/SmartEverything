import { candidateOf, type TvCandidate, type TvInfo } from '@smarteverything/smartthings';
import type { Logger } from '@smarteverything/logging';
import { failureLine } from '@smarteverything/logging';
import type { SamsungTvIo } from './io';
import { lanSweep, type HostSearch } from './lan-sweep';
import { readTvInfo } from './link';
import { ssdpSearch } from './ssdp';

export interface AnsweringTv {
  readonly host: string;
  readonly info: TvInfo;
}

export function everyHost(searches: Readonly<Record<string, HostSearch>>, log: Logger): HostSearch {
  return async () => {
    const heard = await Promise.all(
      Object.entries(searches).map(async ([way, search]) => {
        try {
          return await search();
        } catch (cause) {
          log.warn('television.search_failed', { way, reason: failureLine(cause) });
          return [];
        }
      }),
    );
    return [...new Set(heard.flat())];
  };
}

export function televisionSearch(log: Logger): HostSearch {
  return everyHost({ ssdp: ssdpSearch, lan: lanSweep() }, log);
}

export async function answeringTelevisions(
  io: SamsungTvIo,
  search: HostSearch,
  log: Logger,
): Promise<readonly AnsweringTv[]> {
  const hosts = await search();
  const found = await Promise.all(
    hosts.map(async (host): Promise<AnsweringTv | null> => {
      try {
        return { host, info: await readTvInfo(io, host) };
      } catch (cause) {
        log.debug('television.candidate_unreadable', () => ({ host, reason: failureLine(cause) }));
        return null;
      }
    }),
  );
  const answering = found.filter((tv): tv is AnsweringTv => tv !== null);
  log.info('television.search_finished', { hosts: hosts.length, answering: answering.length });
  return answering;
}

export async function findCandidates(
  io: SamsungTvIo,
  search: HostSearch,
  deviceModel: string,
  log: Logger,
): Promise<TvCandidate[]> {
  return (await answeringTelevisions(io, search, log))
    .map(({ host, info }) => candidateOf(host, info, deviceModel))
    .sort((left, right) => Number(right.likely) - Number(left.likely));
}
