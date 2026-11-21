import type {
  HistoryColumns,
  HistoryPolicy,
  HistoryQuery,
  NodeDemandTopics,
  NodeHello,
  NodeSampleFrame,
  ProcessWindow,
  ProcessesUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerCollector } from '../collectors/collector';
import { Sampler } from '../collectors/sampler';
import type { SampleTopic } from '../collectors/tick';
import type { ProcessControl } from '../controls/controls';

export interface NodeMetrics {
  readonly hello: (now: Date) => Promise<NodeHello>;
  readonly start: () => void;
  readonly stop: () => void;
  readonly demand: (owner: string, topics: NodeDemandTopics) => void;
  readonly release: (owner: string) => void;
  readonly poke: (topic: SampleTopic) => void;
  readonly setPolicy: (policy: HistoryPolicy) => void;
  readonly track: (policy: HistoryPolicy | null) => void;
  readonly watchProcesses: (window: ProcessWindow | null) => void;
  readonly backfill: (query: HistoryQuery) => Promise<HistoryColumns>;
  readonly close: () => void;
}

export interface MetricsDeps {
  readonly processes: Pick<ProcessControl, 'read' | 'watch'>;
  readonly policy: HistoryPolicy;
  readonly emit: (frame: NodeSampleFrame) => void;
  readonly now: () => number;
  readonly log: Logger;
}

export type MetricsFactory = (deps: MetricsDeps) => NodeMetrics;

class InlineMetrics implements NodeMetrics {
  private readonly sampler: Sampler;

  constructor(
    private readonly collector: ComputerCollector,
    private readonly deps: MetricsDeps,
  ) {
    this.sampler = new Sampler({
      readers: {
        ...collector.readers,
        processes: (tick): ProcessesUpdate | null => deps.processes.read(tick),
      },
      policy: deps.policy,
      emit: deps.emit,
      now: deps.now,
      log: deps.log,
    });
  }

  readonly hello = async (now: Date): Promise<NodeHello> => await this.collector.hello(now);

  readonly start = (): void => {
    this.sampler.start();
  };

  readonly stop = (): void => {
    this.sampler.stop();
  };

  readonly demand = (owner: string, topics: NodeDemandTopics): void => {
    this.sampler.demand(owner, topics);
  };

  readonly release = (owner: string): void => {
    this.sampler.release(owner);
  };

  readonly poke = (topic: SampleTopic): void => {
    this.sampler.poke(topic);
  };

  readonly setPolicy = (policy: HistoryPolicy): void => {
    this.sampler.setPolicy(policy);
  };

  readonly track = (policy: HistoryPolicy | null): void => {
    this.collector.track(policy);
  };

  readonly watchProcesses = (window: ProcessWindow | null): void => {
    this.deps.processes.watch(window);
  };

  readonly backfill = (query: HistoryQuery): Promise<HistoryColumns> =>
    Promise.resolve(this.sampler.backfill(query));

  readonly close = (): void => {
    this.collector.stop();
  };
}

export function inlineMetrics(collector: ComputerCollector): MetricsFactory {
  return (deps) => new InlineMetrics(collector, deps);
}
