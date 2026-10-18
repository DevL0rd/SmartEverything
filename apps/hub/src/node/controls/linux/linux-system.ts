import type {
  ComputerFeature,
  DownloadChunk,
  DownloadPlan,
  FilePlaces,
  FileProperties,
  FileSearchQuery,
  FileSearchResult,
  FileUploadChunk,
  FileUploadResult,
  FileWriteChange,
  FileWriteResult,
  SystemChange,
  SystemState,
  UsbDevice,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runProgram, type RunProgram } from '../../run-program';
import type { FileWriteControl, SystemControls, SystemSettingsControl } from '../system-controls';
import { Autostart } from './autostart';
import { Bluez } from './bluez';
import { FileDownloads } from './download-archive';
import { FilePlacesReader } from './file-places';
import { FileScope } from './file-scope';
import { FileSearch } from './file-search';
import { FilePropertiesReader } from './file-properties';
import { FileUploads } from './file-upload';
import { FileWriter } from './file-write';
import { KeyboardLayouts } from './keyboard-layouts';
import { NetworkManager } from './network-manager';
import {
  BusNotificationInhibitor,
  DoNotDisturb,
  type NotificationInhibitor,
} from './notifications-dnd';
import { PowerProfiles } from './power-profiles';
import { ProcessDetails } from './process-detail';
import { SystemdUser } from './systemd-user';
import { ToolProbe } from './tool-probe';
import { XdgTrash } from './trash';
import { UpowerBattery } from './upower';
import { UsbDevices } from './usb-devices';
import { messageOf } from '@smarteverything/logging';

export interface LinuxSystemOptions {
  readonly log: Logger;
  readonly run?: RunProgram;
  readonly home?: string;
  readonly dataHome?: string;
  readonly inhibitor?: NotificationInhibitor;
  readonly usbRoot?: string;
  readonly globalAutostart?: readonly string[];
}

interface Parts {
  readonly battery: UpowerBattery;
  readonly profiles: PowerProfiles;
  readonly dnd: DoNotDisturb;
  readonly keyboard: KeyboardLayouts;
  readonly network: NetworkManager;
  readonly bluetooth: Bluez;
  readonly usb: UsbDevices;
  readonly log: Logger;
}

const ALWAYS_FEATURES: readonly ComputerFeature[] = [
  'startup_apps',
  'process_priority',
  'files',
  'files_write',
];

type StateKey = Exclude<keyof SystemState, 'usb'>;

class LinuxSystemSettings implements SystemSettingsControl {
  constructor(private readonly parts: Parts) {}

  async state(): Promise<SystemState> {
    const [battery, powerMode, dnd, keyboard, wifi, bluetooth, usb] = await Promise.all([
      this.part('battery', () => this.parts.battery.read()),
      this.part('powerMode', () => this.parts.profiles.read()),
      this.part('dnd', () => this.parts.dnd.read()),
      this.part('keyboard', () => this.parts.keyboard.read()),
      this.part('wifi', () => this.parts.network.read()),
      this.part('bluetooth', () => this.parts.bluetooth.read()),
      this.usb(),
    ]);
    return { battery, powerMode, dnd, keyboard, wifi, bluetooth, usb: [...usb] };
  }

  async apply(change: SystemChange): Promise<void> {
    switch (change.action) {
      case 'power_mode':
        return this.parts.profiles.set(change.mode);
      case 'dnd':
        return this.parts.dnd.set(change.enabled);
      case 'keyboard_layout':
        return this.parts.keyboard.set(change.layout);
      case 'wifi':
        return this.parts.network.setEnabled(change.enabled);
      case 'wifi_connect':
        return this.parts.network.connect(change.network);
      case 'bluetooth':
        return this.parts.bluetooth.setEnabled(change.enabled);
      case 'bluetooth_device':
        return this.parts.bluetooth.setConnected(change.device, change.connected);
    }
  }

  async features(): Promise<readonly ComputerFeature[]> {
    const checks: readonly (readonly [ComputerFeature, () => Promise<boolean>])[] = [
      ['battery', async (): Promise<boolean> => (await this.parts.battery.read()) !== null],
      ['power_profile', (): Promise<boolean> => this.parts.profiles.supported()],
      ['dnd', (): Promise<boolean> => this.parts.dnd.supported()],
      ['keyboard_layout', (): Promise<boolean> => this.parts.keyboard.supported()],
      ['wifi', (): Promise<boolean> => this.parts.network.supported()],
      ['bluetooth', (): Promise<boolean> => this.parts.bluetooth.supported()],
      ['usb', (): Promise<boolean> => this.parts.usb.supported()],
    ];
    const found = await Promise.all(
      checks.map(([feature, check]) => this.featureIf(feature, check)),
    );
    return found.filter((feature) => feature !== null);
  }

  private async usb(): Promise<readonly UsbDevice[]> {
    try {
      return await this.parts.usb.list();
    } catch (cause) {
      this.parts.log.warn('system.part_failed', {
        part: 'usb',
        reason: messageOf(cause).slice(0, 300),
      });
      return [];
    }
  }

  private async featureIf(
    feature: ComputerFeature,
    check: () => Promise<boolean>,
  ): Promise<ComputerFeature | null> {
    try {
      return (await check()) ? feature : null;
    } catch (cause) {
      this.parts.log.warn('system.feature_probe_failed', {
        feature,
        reason: messageOf(cause).slice(0, 300),
      });
      return null;
    }
  }

  private async part<T>(part: StateKey, read: () => Promise<T | null>): Promise<T | null> {
    try {
      return await read();
    } catch (cause) {
      this.parts.log.warn('system.part_failed', { part, reason: messageOf(cause).slice(0, 300) });
      return null;
    }
  }
}

interface FileParts {
  readonly searcher: FileSearch;
  readonly reader: FilePropertiesReader;
  readonly writer: FileWriter;
  readonly uploads: FileUploads;
  readonly downloads: FileDownloads;
  readonly places: FilePlacesReader;
}

class LinuxFiles implements FileWriteControl {
  constructor(private readonly parts: FileParts) {}

  search(query: FileSearchQuery): Promise<FileSearchResult> {
    return this.parts.searcher.search(query);
  }

  properties(path: string): Promise<FileProperties> {
    return this.parts.reader.read(path);
  }

  write(change: FileWriteChange): Promise<FileWriteResult> {
    return this.parts.writer.write(change);
  }

  upload(chunk: FileUploadChunk): Promise<FileUploadResult> {
    return this.parts.uploads.receive(chunk);
  }

  places(): Promise<FilePlaces> {
    return this.parts.places.read();
  }

  openDownload(paths: readonly string[]): Promise<DownloadPlan> {
    return this.parts.downloads.open(paths);
  }

  readDownload(id: string, length: number): Promise<DownloadChunk> {
    return this.parts.downloads.read(id, length);
  }

  closeDownload(id: string): Promise<void> {
    return this.parts.downloads.close(id);
  }
}

export function linuxSystemControls(options: LinuxSystemOptions): SystemControls {
  const run = options.run ?? runProgram;
  const home = options.home ?? homedir();
  const probe = new ToolProbe(run);
  const trash = new XdgTrash(options.dataHome ?? join(home, '.local', 'share'));
  const scope = new FileScope([home, trash.root]);
  const writer = new FileWriter(scope, trash);
  const uploads = new FileUploads(scope);
  const downloads = new FileDownloads(scope);
  const places = new FilePlacesReader(home, {
    mounts: '/proc/self/mounts',
    userDirs: join(home, '.config', 'user-dirs.dirs'),
  });
  const search = new FileSearch(scope);
  const properties = new FilePropertiesReader(scope);
  const systemd = new SystemdUser(run, probe);
  const autostart = new Autostart(join(home, '.config', 'autostart'), options.globalAutostart);
  const settings = new LinuxSystemSettings({
    battery: new UpowerBattery(run, probe),
    profiles: new PowerProfiles(run, probe),
    dnd: new DoNotDisturb(run, probe, options.inhibitor ?? new BusNotificationInhibitor()),
    keyboard: new KeyboardLayouts(run, probe),
    network: new NetworkManager(run, probe),
    bluetooth: new Bluez(run, probe),
    usb: new UsbDevices(options.usbRoot),
    log: options.log,
  });
  return {
    settings,
    startup: autostart,
    services: systemd,
    processes: new ProcessDetails(),
    files: new LinuxFiles({
      searcher: search,
      reader: properties,
      writer,
      uploads,
      downloads,
      places,
    }),
    features: async (): Promise<readonly ComputerFeature[]> => {
      const services: readonly ComputerFeature[] = (await systemd.supported()) ? ['services'] : [];
      return [...(await settings.features()), ...services, ...ALWAYS_FEATURES];
    },
  };
}
