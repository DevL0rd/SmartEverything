import {
  readableLabel,
  sensorLabel,
  type AudioState,
  type ComputerDetail,
  type DisplayMode,
  type DisplayState,
  type ProcessDetail,
  type ProcessList,
  type ServicesState,
  type StartupState,
  type SystemState,
  type WindowsState,
} from '@smarteverything/domain';

type Fields = Record<string, unknown>;

function modeText(mode: DisplayMode | null): string | null {
  if (mode === null) return null;
  const rate = mode.refreshHz % 1 === 0 ? mode.refreshHz : mode.refreshHz.toFixed(1);
  return `${String(mode.width)}x${String(mode.height)}@${String(rate)}`;
}

export function compactAudio(state: AudioState): Fields {
  const outputName = new Map(state.outputs.map((output) => [output.id, output.name]));
  const device = (entry: AudioState['outputs'][number]): Fields => ({
    id: entry.id,
    name: entry.name,
    default: entry.isDefault,
    volume: Math.round(entry.volume),
    muted: entry.muted,
    ...(entry.available ? {} : { offline: true }),
  });
  return {
    outputs: state.outputs.map(device),
    inputs: state.inputs.map(device),
    apps: state.apps.map((app) => ({
      streamId: app.streamId,
      app: app.app,
      volume: Math.round(app.volume),
      muted: app.muted,
      output: app.outputId === null ? null : (outputName.get(app.outputId) ?? app.outputId),
    })),
  };
}

export function compactDisplays(state: DisplayState, modes: boolean): Fields {
  return {
    outputs: state.outputs.map((output) => ({
      id: output.id,
      name: output.name,
      enabled: output.enabled,
      primary: output.primary,
      mode: modeText(output.mode),
      scale: output.scalePercent,
      rotation: output.rotation,
      brightness: output.brightness,
      ...(output.hdr.supported ? { hdr: output.hdr.enabled } : {}),
      ...(output.vrr === null ? {} : { vrr: output.vrr }),
      ...(output.mirrorOf === null ? {} : { mirrorOf: output.mirrorOf }),
      ...(modes ? { modes: output.modes.map(modeText) } : {}),
    })),
    nightLight: state.nightLight.supported
      ? { mode: state.nightLight.mode, active: state.nightLight.active }
      : null,
    ...(state.pendingRevert === null
      ? {}
      : {
          pendingRevert: {
            revertsAt: state.pendingRevert.revertsAt,
            summary: state.pendingRevert.summary,
          },
        }),
  };
}

export function clockText(moment: string): string {
  return new Date(moment).toLocaleTimeString('en-GB');
}

function batteryFacts(battery: SystemState['battery']): Fields | null {
  return battery === null
    ? null
    : {
        level: Math.round(battery.level),
        charging: battery.state === 'charging',
        minutesLeft: battery.minutesLeft,
      };
}

function keyboardFacts(keyboard: SystemState['keyboard']): Fields | null {
  if (keyboard === null) return null;
  const current = keyboard.layouts.find((layout) => layout.id === keyboard.current);
  return {
    layout: current?.name ?? keyboard.current,
    offered: keyboard.layouts.map((layout) => layout.name),
  };
}

function wifiFacts(wifi: SystemState['wifi']): Fields | null {
  return wifi === null
    ? null
    : {
        on: wifi.enabled,
        network: wifi.networks.find((network) => network.connected)?.ssid ?? null,
        saved: wifi.networks.filter((network) => network.known).map((network) => network.ssid),
      };
}

function bluetoothFacts(bluetooth: SystemState['bluetooth']): Fields | null {
  return bluetooth === null
    ? null
    : {
        on: bluetooth.enabled,
        connected: bluetooth.devices.filter((device) => device.connected).map((d) => d.name),
        paired: bluetooth.devices.filter((device) => !device.connected).map((d) => d.name),
      };
}

export function compactSystem(state: SystemState): Fields {
  return {
    battery: batteryFacts(state.battery),
    powerMode: state.powerMode,
    dnd: state.dnd,
    keyboard: keyboardFacts(state.keyboard),
    wifi: wifiFacts(state.wifi),
    bluetooth: bluetoothFacts(state.bluetooth),
  };
}

export function compactUsb(state: SystemState): Fields {
  return {
    devices: state.usb.map((device) => ({
      id: device.id,
      name: device.name,
      ...(device.vendor === null ? {} : { vendor: device.vendor }),
    })),
  };
}

export function compactWindows(state: WindowsState): Fields {
  return {
    windows: state.windows.map((window) => ({
      windowId: window.id,
      title: window.title,
      app: window.app?.name ?? null,
      desktop: window.desktop,
      minimised: window.minimised,
      focused: window.focused,
    })),
  };
}

export function compactServices(state: ServicesState): Fields {
  return {
    services: state.services.map((service) => ({
      unit: service.unit,
      state: service.state,
      atLogin: service.startsAtLogin,
      ...(service.system ? { system: true } : {}),
    })),
    timers: state.timers.map((timer) => ({
      unit: timer.unit,
      next: timer.nextRunAt,
      last: timer.lastRunAt,
    })),
  };
}

export function compactStartup(state: StartupState): Fields {
  return {
    apps: state.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      enabled: entry.enabled,
    })),
  };
}

export function compactProcesses(list: ProcessList): Fields {
  return {
    total: list.total,
    next: list.next,
    processes: list.processes.map((row) => ({
      pid: row.pid,
      name: row.name,
      user: row.user,
      state: row.state,
      cpu: Math.round(row.cpu * 10) / 10,
      memoryBytes: row.memoryBytes,
      ...(row.gpu === null ? {} : { gpu: row.gpu }),
      diskRate: row.diskRate,
      threads: row.threads,
      ppid: row.ppid,
      ...(row.descendants > 0 ? { descendants: row.descendants } : {}),
      own: row.own,
    })),
  };
}

export function compactProcess(detail: ProcessDetail): Fields {
  return Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== null));
}

function percent(value: number | null, label: string): string[] {
  return value === null ? [] : [`${label} ${String(Math.round(value))} %`];
}

function summaryLine(detail: ComputerDetail): string {
  const summary = detail.parts.summary;
  if (summary === undefined) return detail.online ? 'No readings yet' : 'Offline';
  const disk = summary.fullestDisk;
  const battery = summary.batteryLevel;
  return [
    ...percent(summary.cpuLoad, 'processor'),
    ...percent(summary.memoryPercent, 'memory'),
    ...percent(summary.gpuLoad, 'graphics'),
    ...(disk === null ? [] : [`${disk.mount} ${String(Math.round(disk.percent))} % full`]),
    ...(battery === null
      ? []
      : [
          `battery ${String(Math.round(battery))} %${summary.charging === true ? ' charging' : ''}`,
        ]),
  ].join(', ');
}

function batteryOf(detail: ComputerDetail): Fields | null {
  const level = detail.parts.summary?.batteryLevel ?? null;
  return level === null
    ? null
    : { level: Math.round(level), charging: detail.parts.summary?.charging === true };
}

type Sensors = NonNullable<ComputerDetail['parts']['sensors']>;

function readableSensors(sensors: Sensors | undefined): Sensors | undefined {
  if (sensors === undefined) return undefined;
  return {
    sensors: sensors.sensors.map((sensor) => ({
      ...sensor,
      label: sensorLabel(sensor.chip, sensor.label),
    })),
    fans: sensors.fans.map((fan) => ({ ...fan, label: readableLabel(fan.label) })),
  };
}

export function compactNow(detail: ComputerDetail): Fields {
  const { summary, cpu, gpu, memory, disks, network, power } = detail.parts;
  const sensors = readableSensors(detail.parts.sensors);
  return {
    deviceId: detail.deviceId,
    online: detail.online,
    at: detail.at,
    summary: summaryLine(detail),
    battery: batteryOf(detail),
    parts: { summary, cpu, gpu, memory, disks, network, sensors, power },
    features: detail.features,
    scopes: detail.scopes,
    actions: detail.actions,
  };
}
