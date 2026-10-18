import {
  COMPUTER_TOPICS,
  LIVE_INTERVAL_MS,
  type ComputerTopic,
  type HistoryPolicy,
  type NodeDemand,
  type NodeDemandTopics,
  type ProcessWindow,
} from '@smarteverything/domain';
import type { ViewDemand } from '../metrics/viewers';

const TOPICS: ReadonlySet<string> = new Set(COMPUTER_TOPICS);

function isComputerTopic(topic: string): topic is ComputerTopic {
  return TOPICS.has(topic);
}

export function demandedTopics(demand: ViewDemand<ProcessWindow>): ReadonlySet<ComputerTopic> {
  return new Set([...demand.topics].filter(isComputerTopic));
}

export function nodeDemandOf(
  demand: ViewDemand<ProcessWindow>,
  history: HistoryPolicy,
  processes: boolean,
): NodeDemand {
  const topics: NodeDemandTopics = {};
  for (const topic of demandedTopics(demand)) {
    if (topic !== 'processes' || processes) topics[topic] = LIVE_INTERVAL_MS;
  }
  const window =
    topics.processes === undefined ? undefined : demand.details.get('processes')?.at(-1);
  return { topics, ...(window === undefined ? {} : { processes: window }), history };
}
