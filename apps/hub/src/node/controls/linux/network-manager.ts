import { WIFI_NETWORK, type SystemState, type WifiNetwork } from '@smarteverything/domain';
import { setTimeout as delay } from 'node:timers/promises';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { ToolProbe } from './tool-probe';

type Wifi = NonNullable<SystemState['wifi']>;

const WIRELESS = '802-11-wireless';
const ONLINE = 'full';
const CHECK_INTERVAL_MS = 2000;
const CHECK_ATTEMPTS = 5;

export function splitTerse(line: string): readonly string[] {
  const fields: string[] = [];
  let current = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (char === '\\' && index + 1 < line.length) {
      index += 1;
      current += line.charAt(index);
    } else if (char === ':') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function rows(output: string): readonly (readonly string[])[] {
  return output
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(splitTerse);
}

function networkOf(row: readonly string[], known: ReadonlySet<string>): WifiNetwork | null {
  const [inUse = '', ssid = '', signal = '', security = ''] = row;
  if (ssid === '') {
    return null;
  }
  const percent = Number.parseInt(signal, 10);
  return WIFI_NETWORK.parse({
    ssid,
    signalPercent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null,
    secured: security !== '' && security !== '--',
    known: known.has(ssid),
    connected: inUse === '*',
  });
}

export function parseWifiNetworks(
  scan: string,
  known: ReadonlySet<string>,
): readonly WifiNetwork[] {
  const best = new Map<string, WifiNetwork>();
  for (const row of rows(scan)) {
    const network = networkOf(row, known);
    const seen = network === null ? undefined : best.get(network.ssid);
    if (network !== null && (seen === undefined || beats(network, seen))) {
      best.set(network.ssid, network);
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      Number(b.connected) - Number(a.connected) ||
      Number(b.known) - Number(a.known) ||
      (b.signalPercent ?? 0) - (a.signalPercent ?? 0),
  );
}

function beats(candidate: WifiNetwork, seen: WifiNetwork): boolean {
  if (candidate.connected !== seen.connected) {
    return candidate.connected;
  }
  return (candidate.signalPercent ?? 0) > (seen.signalPercent ?? 0);
}

export class NetworkManager {
  constructor(
    private readonly run: RunProgram,
    private readonly probe: ToolProbe,
    private readonly wait: (ms: number) => Promise<void> = (ms) => delay(ms),
  ) {}

  async supported(): Promise<boolean> {
    if (!(await this.probe.available('nmcli', ['-v']))) {
      return false;
    }
    return (await this.devices()).some(([, type]) => type === 'wifi');
  }

  async read(): Promise<Wifi | null> {
    if (!(await this.supported())) {
      return null;
    }
    const enabled = (await this.run('nmcli', ['radio', 'wifi'])).trim() === 'enabled';
    if (!enabled) {
      return { enabled, networks: [] };
    }
    const known = new Set(await this.savedNames());
    const scan = await this.run('nmcli', [
      '-t',
      '-f',
      'IN-USE,SSID,SIGNAL,SECURITY',
      'device',
      'wifi',
      'list',
      '--rescan',
      'no',
    ]);
    return { enabled, networks: [...parseWifiNetworks(scan, known)] };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.require();
    if (!enabled && !(await this.hasOtherLink())) {
      throw new NodeFailureError(
        'blocked',
        'Wi-Fi is the only connection this computer has to SmartEverything; turning it off would cut it off.',
      );
    }
    await this.run('nmcli', ['radio', 'wifi', enabled ? 'on' : 'off']);
  }

  async connect(network: string): Promise<void> {
    await this.require();
    const wanted = network.toLowerCase();
    const name = (await this.savedNames()).find((saved) => saved.toLowerCase() === wanted);
    if (name === undefined) {
      throw new NodeFailureError(
        'not_found',
        `${network} is not a saved network on this computer.`,
      );
    }
    const previous = await this.activeWifi();
    if (previous === name) {
      return;
    }
    await this.switchTo(name, previous);
  }

  private async switchTo(name: string, previous: string | null): Promise<void> {
    const joined = await this.run('nmcli', ['connection', 'up', 'id', name]).then(
      () => true,
      () => false,
    );
    if (joined && (await this.online())) {
      return;
    }
    if (previous === null) {
      throw new NodeFailureError('failed', `Could not get online through ${name}.`);
    }
    const restored = await this.run('nmcli', ['connection', 'up', 'id', previous]).then(
      () => true,
      () => false,
    );
    throw new NodeFailureError(
      'failed',
      restored
        ? `Could not get online through ${name}, so this computer went back to ${previous}.`
        : `Could not get online through ${name}, and could not go back to ${previous}.`,
    );
  }

  private async online(): Promise<boolean> {
    for (let attempt = 0; attempt < CHECK_ATTEMPTS; attempt += 1) {
      const state = await this.run('nmcli', ['-t', '-f', 'CONNECTIVITY', 'general']).then(
        (output) => output.trim(),
        () => '',
      );
      if (state === ONLINE) {
        return true;
      }
      await this.wait(CHECK_INTERVAL_MS);
    }
    return false;
  }

  private async require(): Promise<void> {
    if (!(await this.supported())) {
      throw new NodeFailureError('not_supported', 'This computer has no Wi-Fi to control.');
    }
  }

  private async devices(): Promise<readonly (readonly string[])[]> {
    return rows(await this.run('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE', 'device', 'status']));
  }

  private async hasOtherLink(): Promise<boolean> {
    return (await this.devices()).some(
      ([, type = '', state = '']) => type === 'ethernet' && state === 'connected',
    );
  }

  private async savedNames(): Promise<readonly string[]> {
    const output = await this.run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show']);
    return rows(output)
      .filter(([, type]) => type === WIRELESS)
      .map(([name = '']) => name);
  }

  private async activeWifi(): Promise<string | null> {
    const output = await this.run('nmcli', [
      '-t',
      '-f',
      'NAME,TYPE',
      'connection',
      'show',
      '--active',
    ]);
    const active = rows(output).find(([, type]) => type === WIRELESS);
    return active?.[0] ?? null;
  }
}
