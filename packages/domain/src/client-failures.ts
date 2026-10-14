import { z } from 'zod';
import { MOMENT } from './api/primitives';

export const CLIENT_FAILURES_MAX = 40;

export const CLIENT_CRUMBS_MAX = 12;

export const CLIENT_FAILURE_LEVELS = ['warn', 'error', 'exception'] as const;

export const CLIENT_NATIVE_TRACE = z.discriminatedUnion('state', [
  z.object({
    state: z.enum(['not_native', 'unsupported', 'unavailable', 'too_large', 'unreadable']),
  }),
  z.object({
    state: z.literal('captured'),
    signal: z.int(),
    signalCode: z.int(),
    frames: z
      .array(
        z.object({
          module: z.string().max(240).nullable(),
          function: z.string().max(240).nullable(),
          relativePc: z.string().regex(/^[a-f0-9]{1,16}$/),
        }),
      )
      .max(24),
  }),
]);

export const CLIENT_PROCESS_EXIT = z.object({
  at: MOMENT,
  reason: z.string().min(1).max(80),
  status: z.int(),
  process: z.string().min(1).max(200),
  description: z.string().max(240).nullable(),
  nativeTrace: CLIENT_NATIVE_TRACE.optional(),
});

export const CLIENT_HARNESS_STARTUP = z.object({
  stage: z.enum(['prepare', 'start', 'channel']),
  lastStartupStage: z
    .enum(['entry', 'boot', 'catalogue', 'composition', 'tools', 'register'])
    .optional(),
  guestRevision: z
    .string()
    .regex(/^android-arm64-[a-f0-9]{16}$/)
    .optional(),
  failure: z.enum([
    'handshake_timeout',
    'early_exit',
    'protocol_failed',
    'bootstrap_failed',
    'missing_runtime',
    'storage_unavailable',
    'network_unavailable',
    'permission_denied',
    'assets_invalid',
    'foreground_refused',
    'operation_failed',
    'filesystem_probe_timeout',
    'filesystem_probe_failed',
    'channel_timeout',
    'channel_disconnected',
    'channel_failed',
    'runtime_binding_invalid',
    'native_control_invalid',
    'user_start_required',
    'runtime_unlinked',
  ]),
  stderr: z
    .array(
      z.union([
        z
          .string()
          .regex(
            /^SMARTEVERYTHING_SUPERVISOR:(signal_setup|parent_death|subreaper|parent_changed|fork|child_session|child_parent_death|child_parent_changed|child_wait|children_open|children_read|children_close|children_wait|children_kill|children_join|guest_exit|wait_status):(NONE|EACCES|EPERM|EAGAIN|ENOMEM|EINVAL|EIO|ENOENT|ENOTDIR|ELOOP|ENAMETOOLONG|EMFILE|ENFILE|EBADF|EINTR|ECHILD|ESRCH|EFAULT|ENOSYS|EOVERFLOW|UNKNOWN)$/,
          ),
        z.enum([
          'proot_permission_denied',
          'proot_exec_failed',
          'proot_ptrace_failed',
          'guest_failed',
        ]),
        z
          .string()
          .regex(
            /^SMARTEVERYTHING_STARTUP:(entry|boot|catalogue|composition|tools|register):(runtime_unavailable|operation_failed|route_unavailable|permission_denied|network_failed|invalid_input)$/,
          ),
      ]),
    )
    .max(4),
  exitCode: z.int().optional(),
  filesystemProbeSucceeded: z.boolean().optional(),
  systemCall: z
    .object({
      operation: z.enum(['chmod', 'link', 'symlink', 'stat', 'open', 'fsync', 'close', 'unknown']),
      errno: z.enum([
        'EACCES',
        'EPERM',
        'ENOSPC',
        'EDQUOT',
        'EROFS',
        'ENOENT',
        'EEXIST',
        'EINVAL',
        'EIO',
        'ENOTDIR',
        'EISDIR',
        'ELOOP',
        'ENAMETOOLONG',
        'EMFILE',
        'ENFILE',
        'EXDEV',
        'ENOSYS',
        'EOPNOTSUPP',
        'EBUSY',
        'EBADF',
        'ENOMEM',
        'EINTR',
        'UNKNOWN',
      ]),
    })
    .optional(),
  nativeType: z
    .enum([
      'HarnessFailure',
      'IOException',
      'SecurityException',
      'IllegalArgumentException',
      'JSONException',
      'ForegroundServiceStartNotAllowedException',
      'MissingForegroundServiceTypeException',
      'NativeFailure',
    ])
    .optional(),
});

export const CLIENT_FAILURE = z.object({
  at: MOMENT,
  level: z.enum(CLIENT_FAILURE_LEVELS),
  scope: z.string().min(1).max(60),
  event: z.string().min(1).max(80),
  screen: z.string().max(120).nullable(),
  name: z.string().max(80).nullable(),
  message: z.string().max(400).nullable(),
  stack: z.string().max(1200).nullable(),
  processExit: CLIENT_PROCESS_EXIT.optional(),
  harnessStartup: CLIENT_HARNESS_STARTUP.optional(),
});

export type ClientFailure = z.output<typeof CLIENT_FAILURE>;

const CLIENT_CRUMB = z.object({
  at: MOMENT,
  scope: z.string().min(1).max(60),
  event: z.string().min(1).max(80),
  screen: z.string().max(120).nullable(),
});

export type ClientCrumb = z.output<typeof CLIENT_CRUMB>;

export const CLIENT_FAILURE_REPORT = z.object({
  release: z.string().min(1).max(40),
  platform: z.enum(['android', 'ios', 'web']),
  failures: z.array(CLIENT_FAILURE).min(1).max(CLIENT_FAILURES_MAX),
  recent: z.array(CLIENT_CRUMB).max(CLIENT_CRUMBS_MAX).default([]),
});

export type ClientFailureReport = z.input<typeof CLIENT_FAILURE_REPORT>;
