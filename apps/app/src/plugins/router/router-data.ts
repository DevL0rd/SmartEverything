import {
  formatMegabits,
  ROUTER_SNAPSHOT,
  SPEED_TEST_PROGRESS,
  SPEED_TEST_RESULT,
  type RouterSnapshot,
  type SpeedTestResult,
} from '@smarteverything/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useScreenQuery } from '../../queries/use-screen-query';
import { useEffect } from 'react';
import { z } from 'zod';
import { PLUGIN_PREFIX } from '../../queries/keys';
import type { PluginNoticeText } from '../shared/plugin-notice';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import { pluginLog } from '../shared/plugin-log';
import {
  parsePluginReply,
  readPluginTool,
  usePluginTool,
  type PluginToolRunner,
} from '../use-plugin-tool';
import { background } from '@smarteverything/logging';

export const ROUTER_PLUGIN = 'router';

export function useRouterSnapshot(): PluginStream<RouterSnapshot> {
  return usePluginStream(ROUTER_PLUGIN, 'router.snapshot', ROUTER_SNAPSHOT);
}

function useSpeedTestProgress(): PluginStream<z.output<typeof SPEED_TEST_PROGRESS>> {
  return usePluginStream(ROUTER_PLUGIN, 'router.speed_test', SPEED_TEST_PROGRESS);
}

export function useRouterTools(): PluginToolRunner {
  return usePluginTool(ROUTER_PLUGIN);
}

const SPEED_TESTS = z.strictObject({ tests: z.array(SPEED_TEST_RESULT) });

export type SpeedTestList =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly reason: string }
  | { readonly state: 'ready'; readonly tests: readonly SpeedTestResult[] };

export const SPEED_TESTS_KEY = [...PLUGIN_PREFIX, ROUTER_PLUGIN, 'speed-tests'] as const;

export function speedTestsQuery(): {
  readonly queryKey: typeof SPEED_TESTS_KEY;
  readonly queryFn: () => Promise<readonly SpeedTestResult[]>;
} {
  return {
    queryKey: SPEED_TESTS_KEY,
    queryFn: async (): Promise<readonly SpeedTestResult[]> => {
      const tests = parsePluginReply(
        ROUTER_PLUGIN,
        'list_speed_tests',
        SPEED_TESTS,
        await readPluginTool(ROUTER_PLUGIN, 'list_speed_tests', {}),
      ).tests;
      pluginLog.debug('plugin_query.fetched', {
        pluginId: ROUTER_PLUGIN,
        query: 'list_speed_tests',
        tests: tests.length,
      });
      return tests;
    },
  };
}

export function settledRun(
  progress: PluginStream<z.output<typeof SPEED_TEST_PROGRESS>>,
): string | null {
  return progress.state === 'ready' &&
    (progress.value.phase === 'done' || progress.value.phase === 'failed')
    ? `${progress.at}:${progress.value.phase}`
    : null;
}

export function useSpeedTests(): SpeedTestList {
  const client = useQueryClient();
  const settled = settledRun(useSpeedTestProgress());
  useEffect(() => {
    if (settled !== null) {
      pluginLog.info('plugin_query.invalidated', {
        pluginId: ROUTER_PLUGIN,
        query: 'list_speed_tests',
        reason: 'speed_test_settled',
      });
      background(
        client.invalidateQueries({ queryKey: SPEED_TESTS_KEY }, { cancelRefetch: false }),
        'queries.invalidate_failed',
      );
    }
  }, [client, settled]);
  const query = useScreenQuery(speedTestsQuery());
  if (query.data !== undefined) {
    return { state: 'ready', tests: query.data };
  }
  return query.isError
    ? { state: 'failed', reason: 'The speed test history could not be read' }
    : { state: 'loading' };
}

const PHASE_TEXT = {
  ping: 'Measuring latency…',
  download: 'Measuring download…',
  upload: 'Measuring upload…',
} as const;

export type SpeedTestPhase = z.output<typeof SPEED_TEST_PROGRESS>['phase'];

export interface SpeedTestRun {
  readonly running: boolean;
  readonly failed: boolean;
  readonly phase: SpeedTestPhase | null;
  readonly mbps: number;
  readonly pingMs: number | null;
  readonly reason: string | null;
  readonly line: string | null;
}

const IDLE_RUN: SpeedTestRun = {
  running: false,
  failed: false,
  phase: null,
  mbps: 0,
  pingMs: null,
  reason: null,
  line: null,
};

function lineOf(phase: SpeedTestPhase, mbps: number, reason: string | null): string | null {
  switch (phase) {
    case 'ping':
      return PHASE_TEXT.ping;
    case 'download':
    case 'upload':
      return `${PHASE_TEXT[phase]} ${formatMegabits(mbps)}`;
    case 'failed':
      return reason === null ? 'The speed test failed' : `The speed test failed: ${reason}`;
    case 'done':
      return null;
  }
}

export function useSpeedTestRun(): SpeedTestRun {
  const progress = useSpeedTestProgress();
  if (progress.state !== 'ready') {
    return IDLE_RUN;
  }
  const { phase, mbps, pingMs, reason } = progress.value;
  return {
    running: phase !== 'done' && phase !== 'failed',
    failed: phase === 'failed',
    phase,
    mbps,
    pingMs,
    reason,
    line: lineOf(phase, mbps, reason),
  };
}

export function routerNotice(snapshot: RouterSnapshot): PluginNoticeText | null {
  const connection = snapshot.connection;
  switch (connection.state) {
    case 'not_set_up':
      return {
        tone: 'info',
        title: 'Router not set up',
        body: 'See internet speed, Wi-Fi and every device on your network. Add your router’s address and SSH key, or copy them from Router Monitor.',
        settings: true,
      };
    case 'connecting':
      return {
        tone: 'info',
        title: 'Connecting to the router…',
        body: 'This takes a few seconds.',
        settings: false,
      };
    case 'paused':
      return {
        tone: 'warning',
        title: 'Monitoring is paused',
        body: 'Nothing is read from the router.',
        settings: true,
      };
    case 'unreachable':
      return {
        tone: 'critical',
        title: 'The router can’t be reached',
        body: connection.reason,
        settings: true,
      };
    case 'online':
      return null;
  }
}
