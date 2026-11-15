import {
  COMPUTER_TOPICS,
  LIVE_INTERVAL_MS,
  type ComputerTopic,
  type HistoryPolicy,
  type NodeDemand,
  type NodeDemandTopics,
  type ProcessWindow,
} from '@smarteverything/domain';
import type { DeviceDetail, ViewDemand } from '../metrics/viewers';

const TOPICS: ReadonlySet<string> = new Set(COMPUTER_TOPICS);

function isComputerTopic(topic: string): topic is ComputerTopic {
  return TOPICS.has(topic);
}

export function demandedTopics(demand: ViewDemand<DeviceDetail>): ReadonlySet<ComputerTopic> {
  return new Set([...demand.topics].filter(isComputerTopic));
}

function isWindow(detail: DeviceDetail): detail is ProcessWindow {
  return typeof detail !== 'string';
}

export interface DemandScopes {
  readonly processes: boolean;
  readonly files: boolean;
}

function topicsOf(demand: ViewDemand<DeviceDetail>, scopes: DemandScopes): NodeDemandTopics {
  const topics: NodeDemandTopics = {};
  for (const topic of demandedTopics(demand)) {
    if (topic === 'processes' && !scopes.processes) continue;
    if (topic === 'files' && !scopes.files) continue;
    topics[topic] = LIVE_INTERVAL_MS;
  }
  return topics;
}

function foldersOf(demand: ViewDemand<DeviceDetail>): string[] {
  const paths = (demand.details.get('files') ?? []).filter((detail) => typeof detail === 'string');
  return [...new Set(paths)];
}

export function nodeDemandOf(
  demand: ViewDemand<DeviceDetail>,
  history: HistoryPolicy,
  scopes: DemandScopes,
): NodeDemand {
  const topics = topicsOf(demand, scopes);
  const window =
    topics.processes === undefined
      ? undefined
      : demand.details.get('processes')?.filter(isWindow).at(-1);
  const folders = topics.files === undefined ? [] : foldersOf(demand);
  return {
    topics,
    ...(window === undefined ? {} : { processes: window }),
    ...(folders.length === 0 ? {} : { files: folders }),
    history,
  };
}
