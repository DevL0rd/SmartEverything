import type { ComputerSessionState, MediaStatus, SessionApp } from '@smarteverything/domain';
import { userInfo } from 'node:os';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { SessionControl } from '../session-controls';
import { SessionBus } from './dbus-session';
import type { DesktopEntries } from './desktop-entries';
import { KdeBridge, type FocusedWindow } from './kde-bridge';
import { MprisPlayers } from './mpris';
import { PulseVolume } from './pulse-volume';
import { watchScreenSaver } from './screensaver';

export interface LinuxSessionOptions {
  readonly run: RunProgram;
  readonly entries: DesktopEntries;
  readonly now: () => Date;
  readonly failed: (part: string, cause: unknown) => void;
}

interface Parts {
  readonly bus: SessionBus;
  readonly players: MprisPlayers;
  readonly volume: PulseVolume;
  readonly bridge: KdeBridge;
  readonly unwatch: (() => void)[];
}

type Readings = Pick<ComputerSessionState, 'locked' | 'focused' | 'volume' | 'muted'>;

export class LinuxSession implements SessionControl {
  private parts: Parts | null = null;
  private readings: Readings = { locked: null, focused: null, volume: null, muted: null };
  private onChange: ((session: ComputerSessionState) => void) | null = null;
  private pending = false;

  constructor(private readonly options: LinuxSessionOptions) {}

  async start(onChange: (session: ComputerSessionState) => void): Promise<void> {
    this.onChange = onChange;
    const bus = SessionBus.connect();
    const changed = (): void => {
      this.changed();
    };
    const parts: Parts = {
      bus,
      players: new MprisPlayers(bus, changed, (cause) => {
        this.options.failed('media', cause);
      }),
      volume: new PulseVolume({
        run: this.options.run,
        changed: ({ volume, muted }): void => {
          this.update({ volume, muted });
        },
        failed: (cause): void => {
          this.options.failed('volume', cause);
        },
      }),
      bridge: new KdeBridge(bus, (window) => {
        this.update({ focused: this.appOf(window) });
      }),
      unwatch: [],
    };
    this.parts = parts;
    parts.volume.start();
    await Promise.all([
      this.attempt('media', () => parts.players.start()),
      this.attempt('focus', () => parts.bridge.start()),
      this.attempt('lock', async () => {
        parts.unwatch.push(
          await watchScreenSaver(bus, (locked) => {
            this.update({ locked });
          }),
        );
      }),
    ]);
    this.changed();
  }

  async stop(): Promise<void> {
    const parts = this.parts;
    this.parts = null;
    this.onChange = null;
    if (parts === null) {
      return;
    }
    parts.volume.stop();
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

  setVolume(level: number): Promise<void> {
    return this.require().volume.setVolume(level);
  }

  setMuted(muted: boolean): Promise<void> {
    return this.require().volume.setMuted(muted);
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
