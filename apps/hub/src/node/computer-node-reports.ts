import type {
  ComputerFeature,
  HubFrame,
  NodeHello,
  PowerAction,
  RelayHubFrame,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerControls } from './controls/controls';
import type { EarHostPort } from './ear/ear-host';

export function sameFeatures(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join() === [...right].sort().join();
}

export function machineChanged(
  hello: NodeHello,
  report: Pick<NodeHello, 'actions' | 'permissions'>,
): boolean {
  return (
    JSON.stringify(report) !==
    JSON.stringify({ actions: hello.actions, permissions: hello.permissions })
  );
}

export function isRelay(frame: HubFrame): frame is RelayHubFrame {
  return (
    frame.type === 'relay_open' ||
    frame.type === 'relay_data' ||
    frame.type === 'relay_end' ||
    frame.type === 'relay_close'
  );
}

export async function earHostFeatures(
  earHost: EarHostPort | null,
  log: Logger,
): Promise<readonly ComputerFeature[]> {
  if (earHost === null) {
    return [];
  }
  try {
    await earHost.load();
    return ['ear_host'];
  } catch (cause) {
    log.error('node.ear_host_unavailable', cause, {
      consequence: 'this computer cannot listen for cameras, walkie and Discord',
    });
    return [];
  }
}

export async function machineReport(
  controls: ComputerControls,
  log: Logger,
): Promise<Pick<NodeHello, 'actions' | 'permissions'>> {
  try {
    const report = await controls.machine.report();
    return { actions: [...report.actions], permissions: [...report.permissions] };
  } catch (cause) {
    log.error('node.machine_unknown', cause);
    return { actions: [], permissions: [] };
  }
}

export async function powerActions(
  controls: ComputerControls,
  log: Logger,
): Promise<PowerAction[]> {
  try {
    return await controls.power.available();
  } catch (cause) {
    log.error('node.power_unknown', cause);
    return [];
  }
}
