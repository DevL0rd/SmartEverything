import type { DesktopDriveTuning } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { HubTuningField } from './advanced-hub';
import {
  SIZE_HELPER,
  TIME_HELPER,
  valueTextOf,
  type TuningField,
  type TuningKind,
} from './advanced-model';

export interface TuningRowSpec {
  readonly field: TuningField;
  readonly title: string;
  readonly icon: IconName;
  readonly kind: TuningKind;
  readonly origin: string;
  readonly keywords: readonly string[];
  readonly zero: string;
  readonly helper: string;
  readonly label: string;
}

export interface HubRowSpec {
  readonly field: HubTuningField;
  readonly title: string;
  readonly label: string;
  readonly icon: IconName;
  readonly origin: string;
  readonly keywords: readonly string[];
  readonly helper: string;
}

const COUNT_HELPER = 'A whole number, 1 or more.';
const PUSHED = 'the Hub pushes every change';

const HELPER: Readonly<Record<TuningKind, string>> = {
  count: COUNT_HELPER,
  bytes: SIZE_HELPER,
  seconds: TIME_HELPER,
  keep: `${TIME_HELPER} Leave it empty to keep it until the Hub says it changed.`,
  follow: 'A whole number. Leave it empty to follow ¾ of the requests in flight.',
  switch: COUNT_HELPER,
  readdir: COUNT_HELPER,
};

const LABEL: Readonly<Record<TuningKind, string>> = {
  count: 'Number',
  bytes: 'Size',
  seconds: 'Time',
  keep: 'Time',
  follow: 'Requests',
  switch: 'Setting',
  readdir: 'Setting',
};

type SpecInput = Omit<TuningRowSpec, 'zero' | 'helper' | 'label'> &
  Partial<Pick<TuningRowSpec, 'zero' | 'label'>>;

function spec(input: SpecInput): TuningRowSpec {
  return { zero: 'Off', helper: HELPER[input.kind], label: LABEL[input.kind], ...input };
}

export const KERNEL_ROWS: readonly TuningRowSpec[] = [
  spec({
    field: 'maxBackground',
    title: 'Kernel requests in flight',
    icon: 'gauge',
    kind: 'count',
    label: 'Requests',
    origin: 'like NFS 4.2',
    keywords: ['max background', 'requests in flight', 'queue depth', 'fuse', 'nfs slots'],
  }),
  spec({
    field: 'congestionThreshold',
    title: 'Slow down read ahead at',
    icon: 'trendDown',
    kind: 'follow',
    origin: 'like the kernel',
    keywords: ['congestion threshold', 'read ahead', 'throttle', 'fuse'],
  }),
  spec({
    field: 'maxRequestBytes',
    title: 'Largest read or write',
    icon: 'layers',
    kind: 'bytes',
    origin: 'like NFS',
    keywords: ['max write', 'max read', 'rsize', 'wsize', 'request size'],
  }),
  spec({
    field: 'kernelReadaheadBytes',
    title: 'Kernel read ahead',
    icon: 'download',
    kind: 'bytes',
    origin: 'the kernel’s window',
    keywords: ['readahead', 'read ahead', 'kernel window', 'max readahead'],
  }),
  spec({
    field: 'asyncRead',
    title: 'Read in parallel',
    icon: 'route',
    kind: 'switch',
    origin: 'like rclone',
    keywords: ['async read', 'parallel reads', 'sync read'],
  }),
  spec({
    field: 'writebackCache',
    title: 'Kernel write cache',
    icon: 'pencil',
    kind: 'switch',
    origin: 'NFS buffers writes too',
    keywords: ['writeback cache', 'write cache', 'buffered writes'],
  }),
  spec({
    field: 'readdirPlus',
    title: 'Folder listings with details',
    icon: 'list',
    kind: 'readdir',
    origin: 'like NFS',
    keywords: ['readdirplus', 'rdirplus', 'folder listing', 'directory listing'],
  }),
  spec({
    field: 'parallelDirops',
    title: 'Parallel folder changes',
    icon: 'folderSync',
    kind: 'switch',
    origin: 'like go-fuse',
    keywords: ['parallel dirops', 'folder operations', 'directory operations'],
  }),
];

export const CACHE_ROWS: readonly TuningRowSpec[] = [
  spec({
    field: 'readAheadBytes',
    title: 'Read ahead of the file',
    icon: 'refresh',
    kind: 'bytes',
    origin: 'like rclone',
    keywords: ['buffer size', 'read ahead', 'sequential', 'prefetch', 'rclone'],
  }),
  spec({
    field: 'entrySeconds',
    title: 'Keep folder entries',
    icon: 'folder',
    kind: 'keep',
    origin: PUSHED,
    zero: 'Never',
    keywords: ['entry timeout', 'dentry cache', 'folder entries', 'cache time'],
  }),
  spec({
    field: 'attrSeconds',
    title: 'Keep file details',
    icon: 'fileText',
    kind: 'keep',
    origin: PUSHED,
    zero: 'Never',
    keywords: ['attribute timeout', 'attr cache', 'actimeo', 'file details'],
  }),
  spec({
    field: 'negativeSeconds',
    title: 'Remember missing names',
    icon: 'eyeOff',
    kind: 'keep',
    origin: PUSHED,
    zero: 'Never',
    keywords: ['negative cache', 'missing names', 'lookupcache'],
  }),
  spec({
    field: 'prefetchSmallFiles',
    title: 'Fetch small files in opened folders',
    icon: 'zap',
    kind: 'switch',
    origin: 'like NFS and rclone',
    keywords: ['prefetch', 'small files', 'warm cache'],
  }),
];

export const UPLOAD_ROWS: readonly TuningRowSpec[] = [
  spec({
    field: 'closeWaitsForUpload',
    title: 'Close waits for the upload',
    icon: 'hourglass',
    kind: 'switch',
    origin: 'like rclone',
    keywords: ['close to open', 'cto', 'close waits', 'upload on close'],
  }),
  spec({
    field: 'uploadDelaySeconds',
    title: 'Upload delay after close',
    icon: 'timer',
    kind: 'seconds',
    origin: 'like NFS',
    zero: 'None',
    keywords: ['write back delay', 'upload delay', 'vfs write back'],
  }),
  spec({
    field: 'fsyncWaitsForHub',
    title: 'Saving to disk waits for the Hub',
    icon: 'shield',
    kind: 'switch',
    origin: 'like NFS',
    keywords: ['fsync', 'durability', 'flush', 'sync to disk'],
  }),
  spec({
    field: 'uploadFiles',
    title: 'Files uploaded at once',
    icon: 'upload',
    kind: 'count',
    label: 'Files',
    origin: 'like rclone',
    keywords: ['transfers', 'parallel uploads', 'files at once', 'commit lanes'],
  }),
  spec({
    field: 'uploadFramesInFlight',
    title: 'Upload pieces in flight',
    icon: 'boxes',
    kind: 'count',
    label: 'Pieces',
    origin: 'like NFS',
    keywords: ['upload window', 'frames in flight', 'write slots'],
  }),
  spec({
    field: 'bulkFrameBytes',
    title: 'Upload piece size',
    icon: 'box',
    kind: 'bytes',
    origin: 'like NFS',
    keywords: ['frame size', 'slice size', 'upload piece', 'chunk size'],
  }),
];

export const LINK_ROWS: readonly TuningRowSpec[] = [
  spec({
    field: 'pingSeconds',
    title: 'Check the connection every',
    icon: 'signal',
    kind: 'seconds',
    origin: 'finds a lost Hub fast',
    keywords: ['ping', 'keepalive', 'heartbeat', 'connection check'],
  }),
  spec({
    field: 'deadAfterSeconds',
    title: 'Connection is lost after',
    icon: 'wifi',
    kind: 'seconds',
    origin: 'within NFS’s 60 s',
    keywords: ['timeout', 'dead link', 'reconnect', 'lost connection'],
  }),
];

export const COMPUTER_GROUPS = [
  { title: 'Kernel', rows: KERNEL_ROWS },
  { title: 'Reading and caching', rows: CACHE_ROWS },
  { title: 'Uploads', rows: UPLOAD_ROWS },
  { title: 'Connection', rows: LINK_ROWS },
] as const;

export const COMPUTER_ROWS: readonly TuningRowSpec[] = COMPUTER_GROUPS.flatMap(
  (group) => group.rows,
);

export const HUB_ROWS: readonly HubRowSpec[] = [
  {
    field: 'fileIoThreads',
    title: 'File threads',
    label: 'Threads',
    icon: 'server',
    origin: 'like the NFS server',
    helper: 'A whole number from 1 to 1024.',
    keywords: ['threadpool', 'uv threadpool size', 'file threads', 'io threads', 'nfsd threads'],
  },
  {
    field: 'cpuWorkers',
    title: 'Processing workers',
    label: 'Workers',
    icon: 'cpu',
    origin: 'one per Hub processor core',
    helper: 'A whole number, 1 or more. Hashing and other heavy work runs here.',
    keywords: ['worker threads', 'cpu workers', 'hashing', 'cores'],
  },
  {
    field: 'listingCacheSeconds',
    title: 'Keep unused folder listings',
    label: 'Time',
    icon: 'clock',
    origin: 'like rclone',
    helper: `${TIME_HELPER} 0 turns it off.`,
    keywords: ['listing cache', 'dir cache time', 'folder listings', 'memory'],
  },
];

export function subtitleOf(row: TuningRowSpec, defaults: DesktopDriveTuning): string {
  const value = valueTextOf(row.kind, defaults[row.field], row.zero);
  return `Default ${value.charAt(0).toLowerCase()}${value.slice(1)}, ${row.origin}`;
}
