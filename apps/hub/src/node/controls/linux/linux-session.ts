import type { ComputerSessionState, MediaStatus, SessionApp } from '@smarteverything/domain';
import { userInfo } from 'node:os';
import { NodeFailureError } from '../../node-failure';
import type { SessionControl } from '../session-controls';
import { SessionBus } from './dbus-session';
import type { DesktopEntries } from './desktop-entries';
import { KdeBridge, type FocusedWindow } from './kde-bridge';
import { MprisPlayers } from './mpris';
import type { PulseAudio } from './pulse-audio';
import { watchScreenSaver } from './screensaver';
import { messageOf } from '@smarteverything/logging';

export interface LinuxSessionOptions {
  readonly entries: DesktopEntries;
  readonly audio: PulseAudio;
  readonly now: () => Date;
  readonly failed: (part: string, cause: unknown) => void;
}

interface Parts {
  readonly bus: SessionBus;
  readonly players: MprisPlayers;
  readonly bridge: KdeBridge;
  readonly unwatch: (() => void)[];
}

type Readings = Pick<ComputerSessionState, 'locked' | 'focused' | 'volume' | 'muted'>;

export class LinuxSession implements SessionControl {
  private parts: Parts | null = null;
  private readings: Readings = { locked: null, focused: null, volume: null, muted: null };
  private onChange: ((session: ComputerSessionState) => void) | null = null;
  private pending = false;
  private generation = 0;

  constructor(private readonly options: LinuxSessionOptions) {}

  async start(onChange: (session: ComputerSessionState) => void): Promise<void> {
    const generation = ++this.generation;
    this.onChange = onChange;
    const bus = SessionBus.connect();
    if (!(await this.reach(bus, generation))) {
      return;
    }
    const parts = this.assemble(bus);
    this.parts = parts;
    await Promise.all([
      this.attempt('media', () => parts.players.start()),
      this.attempt('focus', () => parts.bridge.start()),
      this.attempt('lock', async () => {
        const unwatch = await watchScreenSaver(bus, (locked) => {
          this.update({ locked });
        });
        if (generation === this.generation) {
          parts.unwatch.push(unwatch);
        } else {
          unwatch();
        }
      }),
    ]);
    this.changed();
  }

  async stop(): Promise<void> {
    this.generation += 1;
    const parts = this.parts;
    this.parts = null;
    this.onChange = null;
    if (parts === null) {
      return;
    }
    parts.players.stop();
    parts.unwatch.forEach((unwatch) => {
      unwatch();
    });
    try {
      await parts.bridge.stop();
    } finally {
      parts.bus.close();
    }
  }

  bridge(): KdeBridge {
    return this.require().bridge;
  }

  bus(): SessionBus {
    return this.require().bus;
  }

  async setVolume(level: number): Promise<void> {
    await this.options.audio.change({ action: 'volume', level, kind: 'output' });
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.options.audio.change({ action: 'mute', muted, kind: 'output' });
  }

  playback(status: MediaStatus): Promise<void> {
    return this.require().players.control(status);
  }

  private require(): Parts {
    if (this.parts === null) {
      throw new NodeFailureError('no_session', 'Nobody is signed in on this computer.');
    }
    return this.parts;
  }

  private assemble(bus: SessionBus): Parts {
    return {
      bus,
      players: new MprisPlayers(
        bus,
        () => {
          this.changed();
        },
        (cause) => {
          this.options.failed('media', cause);
        },
      ),
      bridge: new KdeBridge(bus, (window) => {
        this.update({ focused: this.appOf(window) });
      }),
      unwatch: [
        this.options.audio.watchMaster((reading) => {
          this.update({ volume: reading?.volume ?? null, muted: reading?.muted ?? null });
        }),
      ],
    };
  }

  private async reach(bus: SessionBus, generation: number): Promise<boolean> {
    try {
      await bus.connected();
    } catch (cause) {
      bus.close();
      if (generation !== this.generation) {
        return false;
      }
      throw new NodeFailureError(
        'no_session',
        `The desktop session bus is not reachable: ${messageOf(cause)}`,
      );
    }
    if (generation !== this.generation) {
      bus.close();
      return false;
    }
    bus.onError((cause) => {
      this.options.failed('bus', cause);
    });
    return true;
  }

  private async attempt(part: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (cause) {
      this.options.failed(part, cause);
    }
  }

  private appOf(window: FocusedWindow | null): SessionApp | null {
    if (window === null) {
      return null;
    }
    const entry =
      window.desktopFile === '' ? undefined : this.options.entries.find(window.desktopFile);
    const id = window.desktopFile === '' ? window.resourceClass : window.desktopFile;
    return { id, name: entry?.name ?? window.resourceClass };
  }

  private update(change: Partial<Readings>): void {
    this.readings = { ...this.readings, ...change };
    this.changed();
  }

  private changed(): void {
    if (this.pending) {
      return;
    }
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      const parts = this.parts;
      if (parts === null || this.onChange === null) {
        return;
      }
      this.onChange({
        at: this.options.now().toISOString(),
        user: userInfo().username,
        ...this.readings,
        media: parts.players.current(),
      });
    });
  }
}
