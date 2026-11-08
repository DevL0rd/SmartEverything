import { readBuildEnv } from '../platform/build-env';
import { SHIP_LEVEL_FLAGS, shipLevelOf, type ShipLevelFlagId } from '../platform/ship-level';

export const LOG_LEVEL_CHOICES = ['info', 'debug', 'trace'] as const;

export type LogLevelChoice = (typeof LOG_LEVEL_CHOICES)[number];

export type LogLevelFlagId = `log.level.${LogLevelChoice}`;

export const LOG_LEVEL_FLAGS: Readonly<Record<LogLevelChoice, LogLevelFlagId>> = {
  info: 'log.level.info',
  debug: 'log.level.debug',
  trace: 'log.level.trace',
};

export const LEVEL_TEXT: Readonly<Record<LogLevelChoice, string>> = {
  info: 'Connections, saves, warnings and errors.',
  debug: 'Adds diagnostic details, such as frames and live messages.',
  trace: 'Includes internal steps. Use for short investigations.',
};

export type DeveloperFlagId =
  | 'perf.sampling'
  | 'perf.profilers'
  | 'perf.renders'
  | 'perf.stalls'
  | 'perf.network'
  | 'perf.lists'
  | 'perf.fanout'
  | 'perf.nav'
  | 'perf.upload'
  | ProfilingFlagId
  | LogLevelFlagId
  | ShipLevelFlagId
  | 'watch.capture';

export type ProfilingFlagId =
  | 'perf.frames'
  | 'perf.gc'
  | 'perf.native'
  | 'perf.timers'
  | 'perf.leaks'
  | 'perf.wire'
  | 'perf.bridge'
  | 'perf.storage'
  | 'perf.startup'
  | 'perf.observer'
  | 'perf.media'
  | 'perf.cpu'
  | 'perf.heap';

export interface DeveloperToggle {
  readonly id: Exclude<DeveloperFlagId, LogLevelFlagId | ShipLevelFlagId>;
  readonly section: 'Performance' | 'Logging' | 'Watch';
  readonly label: string;
  readonly description: string;
  readonly cost: string;
  readonly parent: DeveloperFlagId | null;
  readonly keywords: readonly string[];
  readonly initial?: true;
}

export type DeveloperFlags = Readonly<Record<DeveloperFlagId, boolean>>;

export type StoredFlags = Readonly<Record<string, boolean>>;

function profiling(
  id: ProfilingFlagId,
  text: Pick<DeveloperToggle, 'label' | 'description' | 'cost' | 'keywords'>,
): DeveloperToggle {
  return { id, section: 'Performance', parent: null, ...text };
}

const PROFILING_TOGGLES: readonly DeveloperToggle[] = [
  {
    ...profiling('perf.frames', {
      label: 'Frames and UI thread',
      description:
        'Measures JavaScript and UI-thread frames, long tasks, and React commits when the renderer provides timings.',
      cost: 'A 250 ms timer and the native frame-metrics listener. Requests no frames.',
      keywords: ['fps', 'frames', 'jank', 'ui thread', 'reanimated', 'long task', 'window'],
    }),
    initial: true,
  },
  profiling('perf.gc', {
    label: 'Garbage collection and allocation',
    description:
      'Adds Hermes collections, collection time, allocated megabytes and heap size to each window.',
    cost: 'One Hermes statistics read per window.',
    keywords: ['gc', 'garbage collection', 'heap', 'allocation', 'hermes', 'memory'],
  }),
  profiling('perf.native', {
    label: 'Native process',
    description:
      'Adds memory (RSS, PSS, native and graphics), thread CPU, native frame jank, thermal state and battery drain. Needs an app build that has it.',
    cost: 'One background native read per window and a frame-metrics listener on the UI thread.',
    keywords: ['native', 'rss', 'pss', 'cpu', 'thread', 'frame metrics', 'thermal', 'battery'],
  }),
  profiling('perf.timers', {
    label: 'Timers and animation frames',
    description:
      'Counts timeouts, intervals and animation-frame callbacks alive per screen and those left running after leaving it.',
    cost: 'A small wrapper around every timer call.',
    keywords: ['timers', 'interval', 'timeout', 'raf', 'animation frame', 'leak'],
  }),
  profiling('perf.leaks', {
    label: 'Listeners and mounted tree',
    description:
      'Counts event listeners, query observers and React fibers alive, by the screen that created them.',
    cost: 'A wrapper on event subscriptions and one tree count every 30 seconds.',
    keywords: ['leak', 'listeners', 'subscriptions', 'fibers', 'mounted', 'observers'],
  }),
  profiling('perf.wire', {
    label: 'Network and live messages',
    description:
      'Counts socket frames and bytes per socket, live messages per type with JSON and schema parse time, and requests with size per path.',
    cost: 'Two clock reads per message and a wrapper around fetch and HubNetwork.request.',
    keywords: ['websocket', 'network', 'bytes', 'zod', 'json', 'parse', 'requests', 'live'],
  }),
  profiling('perf.bridge', {
    label: 'Native module calls',
    description: 'Counts calls and time per native module function, such as HubNetwork.request.',
    cost: 'A wrapper around every Expo native module function.',
    keywords: ['bridge', 'native module', 'jsi', 'hubnetwork', 'calls', 'latency'],
  }),
  profiling('perf.storage', {
    label: 'Storage reads and writes',
    description: 'Counts AsyncStorage reads and writes with their size and time.',
    cost: 'A wrapper around each storage call.',
    keywords: ['storage', 'asyncstorage', 'persistence', 'disk', 'writes'],
  }),
  profiling('perf.startup', {
    label: 'Startup timeline',
    description:
      'Logs the cold start once: native start, bundle load, first render and the slowest module requires.',
    cost: 'Free after start; module timing is recorded by the development bundle.',
    keywords: ['startup', 'cold start', 'bundle', 'require', 'first render', 'tti'],
  }),
  profiling('perf.observer', {
    label: 'Long tasks, input delay and request timing',
    description:
      'Reads the React Native performance timeline: long tasks, slow taps and request connect and TLS time.',
    cost: 'One performance observer.',
    keywords: ['longtask', 'event timing', 'input delay', 'tls', 'resource', 'observer'],
  }),
  profiling('perf.media', {
    label: 'Camera video decoding',
    description:
      'Adds decoded and dropped frames, decode time, freezes and bitrate for open camera streams.',
    cost: 'One statistics call per open stream per window.',
    keywords: ['camera', 'webrtc', 'video', 'decode', 'dropped frames', 'bitrate'],
  }),
  profiling('perf.cpu', {
    label: 'CPU profile capture signal',
    description:
      'Asks the desktop capture script to record Hermes CPU profiles per screen and keep those with long tasks.',
    cost: 'Free in the app; the sampling profiler adds a few percent while the script runs.',
    keywords: ['cpu', 'profile', 'hermes', 'sampling', 'flame graph', 'call tree'],
  }),
  profiling('perf.heap', {
    label: 'Heap allocation capture signal',
    description:
      'Asks the desktop capture script to sample JavaScript allocations per screen to find allocation-heavy code.',
    cost: 'Free in the app; heap sampling slows allocation while the script runs.',
    keywords: ['heap', 'allocation', 'snapshot', 'memory', 'leak', 'sampling'],
  }),
];

export const DEVELOPER_TOGGLES: readonly DeveloperToggle[] = [
  {
    id: 'perf.sampling',
    section: 'Performance',
    label: 'Performance sampling',
    description: 'Collects timing samples and enables the options in this section.',
    cost: 'One timer and one store hook; each enabled option adds its own cost.',
    parent: null,
    keywords: ['profiler', 'probe', 'lag', 'slow', 'jank', 'performance', 'samples'],
  },
  {
    id: 'perf.profilers',
    section: 'Performance',
    label: 'React profiler wrappers',
    description: 'Wraps every screen and the chat parts in a React Profiler for commit times.',
    cost: 'One extra component layer per screen and a callback on every commit.',
    parent: 'perf.sampling',
    keywords: ['react profiler', 'commits', 'render time', 'screens'],
  },
  {
    id: 'perf.renders',
    section: 'Performance',
    label: 'Render-storm keys',
    description: 'Walks every React commit to name the components that re-rendered and why.',
    cost: 'The heaviest option: a walk of the changed part of the tree after each commit.',
    parent: 'perf.sampling',
    keywords: ['render storm', 'why did you render', 're-render', 'props', 'hooks', 'fiber'],
  },
  {
    id: 'perf.stalls',
    section: 'Performance',
    label: 'Stall, frame and GC tracking',
    description:
      'Measures frame gaps, dragged frames, heap and garbage collection, keyboard events.',
    cost: 'A 250 ms timer, plus a touch-move event to JavaScript while a finger is down. Requests no frames.',
    parent: 'perf.sampling',
    keywords: ['stall', 'fps', 'frames', 'gc', 'garbage collection', 'heap', 'memory', 'dropped'],
  },
  {
    id: 'perf.network',
    section: 'Performance',
    label: 'Network and JSON timing',
    description: 'Times every request and JSON parse and attributes store updates to them.',
    cost: 'Replaces fetch and JSON.parse with timed wrappers for the whole app.',
    parent: 'perf.sampling',
    keywords: ['network', 'fetch', 'json', 'requests', 'query', 'timing'],
  },
  {
    id: 'perf.lists',
    section: 'Performance',
    label: 'List metrics',
    description: 'Counts mounted rows, blank area and scroll frames in the chat and model lists.',
    cost: 'Swaps in a probing list cell with a layout callback per row.',
    parent: 'perf.sampling',
    keywords: ['list', 'rows', 'blank', 'scroll', 'virtualized', 'flatlist'],
  },
  {
    id: 'perf.fanout',
    section: 'Performance',
    label: 'Store and query fan-out',
    description:
      'Names the store slices, queries and requests that woke listeners and how many renders followed.',
    cost: 'A key comparison of the changed store slices on every store update.',
    parent: 'perf.sampling',
    keywords: ['store', 'fan-out', 'listeners', 'query', 'notify', 'subscriptions'],
    initial: true,
  },
  {
    id: 'perf.nav',
    section: 'Performance',
    label: 'Navigation timing',
    description:
      'Times each screen change from the tap to the second frame after it, with its renders.',
    cost: 'Two animation-frame callbacks per screen change, counted as probeFrames.',
    parent: 'perf.sampling',
    keywords: ['navigation', 'screen change', 'transition', 'route', 'timing'],
    initial: true,
  },
  {
    id: 'perf.upload',
    section: 'Performance',
    label: 'Send performance samples to the hub',
    description: 'Sends profiling reports to the hub. Does not control runtime log uploads.',
    cost: 'One small request every 10 seconds of activity.',
    parent: 'perf.sampling',
    keywords: ['upload', 'send', 'report', 'hub', 'samples', 'telemetry'],
  },
  ...PROFILING_TOGGLES,
  {
    id: 'watch.capture',
    section: 'Watch',
    label: 'Save raw watch files',
    description:
      'Saves every file the watch sends during a sync, unchanged, on the hub for parser testing. The same file is kept once. Turning it off stops saving; the saved files stay until Clear.',
    cost: 'One extra upload per sync with the raw bytes of each new file, kept on the hub disk.',
    parent: null,
    keywords: ['watch', 'raw', 'capture', 'files', 'sleep', 'parser', 'bytes', 'xiaomi'],
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
  'perf.fanout': false,
  'perf.nav': false,
  'perf.upload': false,
  'perf.frames': false,
  'perf.gc': false,
  'perf.native': false,
  'perf.timers': false,
  'perf.leaks': false,
  'perf.wire': false,
  'perf.bridge': false,
  'perf.storage': false,
  'perf.startup': false,
  'perf.observer': false,
  'perf.media': false,
  'perf.cpu': false,
  'perf.heap': false,
  'watch.capture': false,
  'log.level.info': false,
  'log.level.debug': false,
  'log.level.trace': false,
  'log.ship.warn': false,
  'log.ship.info': false,
  'log.ship.debug': false,
  'log.ship.trace': false,
};

export function allOff(): Record<DeveloperFlagId, boolean> {
  return { ...OFF };
}

export function storedLogLevel(stored: StoredFlags): LogLevelChoice {
  if (stored[LOG_LEVEL_FLAGS.trace] === true) return 'trace';
  if (stored[LOG_LEVEL_FLAGS.debug] === true) return 'debug';
  return 'info';
}

export function withLogLevel(stored: StoredFlags, level: LogLevelChoice): StoredFlags {
  const rest = Object.entries(stored).filter(([id]) => !id.startsWith('log.level.'));
  return { ...Object.fromEntries(rest), [LOG_LEVEL_FLAGS[level]]: true };
}

function profilingMode(): 'on' | 'off' | null {
  const env = readBuildEnv();
  return env.success ? (env.data.profiling ?? null) : null;
}

function wantedBy(
  toggle: DeveloperToggle,
  stored: StoredFlags,
  mode: 'on' | 'off' | null,
): boolean {
  const profiled = toggle.id.startsWith('perf.');
  if (profiled && mode === 'off') {
    return false;
  }
  if (profiled && mode === 'on' && toggle.id !== 'perf.upload') {
    return true;
  }
  return stored[toggle.id] ?? toggle.initial === true;
}

export function resolveFlags(stored: StoredFlags, developer: boolean): DeveloperFlags {
  const flags = allOff();
  const mode = developer ? profilingMode() : 'off';
  DEVELOPER_TOGGLES.forEach((toggle) => {
    const parentOn = toggle.parent === null || flags[toggle.parent];
    flags[toggle.id] = developer ? wantedBy(toggle, stored, mode) && parentOn : false;
  });
  flags[LOG_LEVEL_FLAGS[storedLogLevel(stored)]] = developer;
  const shipping = SHIP_LEVEL_FLAGS[shipLevelOf(stored)];
  flags[shipping] = developer && stored[shipping] === true;
  return flags;
}
