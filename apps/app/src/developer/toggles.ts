export type DeveloperFlagId =
  | 'perf.sampling'
  | 'perf.profilers'
  | 'perf.renders'
  | 'perf.stalls'
  | 'perf.network'
  | 'perf.lists'
  | 'perf.upload'
  | 'log.debug';

export interface DeveloperToggle {
  readonly id: DeveloperFlagId;
  readonly section: 'Performance' | 'Logging';
  readonly label: string;
  readonly description: string;
  readonly cost: string;
  readonly reload: boolean;
  readonly release: boolean;
  readonly parent: DeveloperFlagId | null;
  readonly keywords: readonly string[];
}

export type DeveloperFlags = Readonly<Record<DeveloperFlagId, boolean>>;

export type StoredFlags = Readonly<Record<string, boolean>>;

export const DEVELOPER_TOGGLES: readonly DeveloperToggle[] = [
  {
    id: 'perf.sampling',
    section: 'Performance',
    label: 'Performance sampling',
    description: 'Collects timing samples in 10 second windows. Needed by every option below.',
    cost: 'Small by itself (one timer, one store hook); each option below adds its own cost.',
    reload: true,
    release: false,
    parent: null,
    keywords: ['profiler', 'probe', 'lag', 'slow', 'jank', 'performance', 'samples'],
  },
  {
    id: 'perf.profilers',
    section: 'Performance',
    label: 'React profiler wrappers',
    description: 'Wraps every screen and the chat parts in a React Profiler for commit times.',
    cost: 'One extra component layer per screen and a callback on every commit.',
    reload: true,
    release: false,
    parent: 'perf.sampling',
    keywords: ['react profiler', 'commits', 'render time', 'screens'],
  },
  {
    id: 'perf.renders',
    section: 'Performance',
    label: 'Render-storm keys',
    description: 'Walks every React commit to name the components that re-rendered and why.',
    cost: 'The heaviest option: a walk of the changed part of the tree after each commit.',
    reload: true,
    release: false,
    parent: 'perf.sampling',
    keywords: ['render storm', 'why did you render', 're-render', 'props', 'hooks', 'fiber'],
  },
  {
    id: 'perf.stalls',
    section: 'Performance',
    label: 'Stall, frame and GC tracking',
    description:
      'Measures frame gaps, dragged frames, heap and garbage collection, keyboard events.',
    cost: 'A callback every frame, plus a touch-move event to JavaScript while a finger is down.',
    reload: true,
    release: false,
    parent: 'perf.sampling',
    keywords: ['stall', 'fps', 'frames', 'gc', 'garbage collection', 'heap', 'memory', 'dropped'],
  },
  {
    id: 'perf.network',
    section: 'Performance',
    label: 'Network and JSON timing',
    description: 'Times every request and JSON parse and attributes store updates to them.',
    cost: 'Replaces fetch and JSON.parse with timed wrappers for the whole app.',
    reload: true,
    release: false,
    parent: 'perf.sampling',
    keywords: ['network', 'fetch', 'json', 'requests', 'query', 'timing'],
  },
  {
    id: 'perf.lists',
    section: 'Performance',
    label: 'List metrics',
    description: 'Counts mounted rows, blank area and scroll frames in the chat and model lists.',
    cost: 'Swaps in a probing list cell with a layout callback per row.',
    reload: true,
    release: false,
    parent: 'perf.sampling',
    keywords: ['list', 'rows', 'blank', 'scroll', 'virtualized', 'flatlist'],
  },
  {
    id: 'perf.upload',
    section: 'Performance',
    label: 'Upload samples to the hub',
    description:
      'Sends each window to the hub through the client report channel. Off prints to the console at debug level.',
    cost: 'One small request every 10 seconds of activity, and the lines occupy the crash trail.',
    reload: true,
    release: false,
    parent: 'perf.sampling',
    keywords: ['upload', 'send', 'report', 'hub', 'samples', 'telemetry'],
  },
  {
    id: 'log.debug',
    section: 'Logging',
    label: 'Verbose logging',
    description: 'Logs at debug level instead of info. Applies at once.',
    cost: 'A few extra log lines for connections and live updates.',
    reload: false,
    release: true,
    parent: null,
    keywords: ['log', 'logging', 'debug', 'verbose', 'console', 'log level'],
  },
];

export function toggleOf(id: DeveloperFlagId): DeveloperToggle {
  const found = DEVELOPER_TOGGLES.find((toggle) => toggle.id === id);
  if (found === undefined) {
    throw new Error(`No developer toggle has the id ${id}`);
  }
  return found;
}

const OFF: DeveloperFlags = {
  'perf.sampling': false,
  'perf.profilers': false,
  'perf.renders': false,
  'perf.stalls': false,
  'perf.network': false,
  'perf.lists': false,
  'perf.upload': false,
  'log.debug': false,
};

export function allOff(): Record<DeveloperFlagId, boolean> {
  return { ...OFF };
}

export function resolveFlags(stored: StoredFlags, development: boolean): DeveloperFlags {
  const flags = allOff();
  DEVELOPER_TOGGLES.forEach((toggle) => {
    const parentOn = toggle.parent === null || flags[toggle.parent];
    flags[toggle.id] = stored[toggle.id] === true && parentOn && (development || toggle.release);
  });
  return flags;
}
