import {
  ROUTER_SNAPSHOT,
  SPEED_TEST_PROGRESS,
  SPEED_TEST_RESULT,
  type RouterSnapshot,
  type SpeedTestResult,
} from '@smarteverything/domain';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useDevices } from '../../store/selectors';
import type { Device } from '../../store/state';
import type { PluginNoticeText } from '../shared/plugin-notice';
import { megabits } from '../shared/rate-format';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';
import { usePluginTool, type PluginToolRunner } from '../use-plugin-tool';

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

export function useRouterDevice(): Device | null {
  return useDevices({ includeHidden: true }).find((device) => device.kind === 'router') ?? null;
}

const SPEED_TESTS = z.strictObject({ tests: z.array(SPEED_TEST_RESULT) });

export type SpeedTestList =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly reason: string }
  | { readonly state: 'ready'; readonly tests: readonly SpeedTestResult[] };

export function useSpeedTests(refreshKey: string): SpeedTestList {
  const tools = useRouterTools();
  const [list, setList] = useState<SpeedTestList>({ state: 'loading' });
  useEffect(() => {
    void tools.run('list_speed_tests', {}).then((result) => {
      const parsed = SPEED_TESTS.safeParse(result);
      setList(
        parsed.success
          ? { state: 'ready', tests: parsed.data.tests }
          : { state: 'failed', reason: 'The speed test history could not be read' },
      );
    });
  }, [tools, refreshKey]);
  return list;
}

const PHASE_TEXT = {
  ping: 'Measuring latency…',
  download: 'Measuring download…',
  upload: 'Measuring upload…',
} as const;

export function useSpeedTestRun(): {
  readonly running: boolean;
  readonly line: string | null;
  readonly key: string;
} {
  const progress = useSpeedTestProgress();
  if (progress.state !== 'ready') {
    return { running: false, line: null, key: 'none' };
  }
  const { phase, mbps, reason } = progress.value;
  const key = `${progress.at}:${phase}`;
  if (phase === 'failed') {
    return {
      running: false,
      line: reason === null ? 'The speed test failed' : `The speed test failed: ${reason}`,
      key,
    };
  }
  if (phase === 'done') {
    return { running: false, line: null, key };
  }
  return {
    running: true,
    line: phase === 'ping' ? PHASE_TEXT.ping : `${PHASE_TEXT[phase]} ${megabits(mbps)}`,
    key,
  };
}

export function routerNotice(snapshot: RouterSnapshot): PluginNoticeText | null {
  const connection = snapshot.connection;
  switch (connection.state) {
    case 'not_set_up':
      return {
        tone: 'info',
        title: 'Router not set up',
        body: 'Add your router’s address and SSH key, or copy them from Router Monitor.',
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
