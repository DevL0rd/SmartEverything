import { MEDIA_STATUSES, type MediaStatus, type NowPlaying } from '@smarteverything/domain';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import { variant, type SessionBus } from './dbus-session';

const PREFIX = 'org.mpris.MediaPlayer2.';
const PLAYER_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const DAEMON = {
  destination: 'org.freedesktop.DBus',
  path: '/org/freedesktop/DBus',
  iface: 'org.freedesktop.DBus',
} as const;

const STATUSES: Readonly<Record<'Playing' | 'Paused' | 'Stopped', MediaStatus>> = {
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
};

const STATUS = z.enum(['Playing', 'Paused', 'Stopped']).transform((status) => STATUSES[status]);

const METADATA = z.record(z.string(), z.unknown());

const PLAYER_PROPERTIES = z.tuple([
  z.object({ PlaybackStatus: variant(STATUS), Metadata: variant(METADATA).optional() }),
]);

const TEXT = variant(z.string());
const ARTISTS = variant(z.array(z.string()));
const NAMES = z.tuple([z.array(z.string())]);
const OWNER = z.tuple([z.string()]);
const OWNER_CHANGED = z.tuple([z.string(), z.string(), z.string()]);

const ACTIONS: Readonly<Record<MediaStatus, string>> = {
  playing: 'Play',
  paused: 'Pause',
  stopped: 'Stop',
};

interface Player {
  readonly name: string;
  readonly owner: string;
  readonly media: NowPlaying;
  readonly changedAt: number;
}

function playerLabel(name: string): string {
  const [label = name] = name.slice(PREFIX.length).split('.');
  return label;
}

function nowPlaying(name: string, body: readonly unknown[]): NowPlaying {
  const [properties] = PLAYER_PROPERTIES.parse(body);
  const metadata = properties.Metadata ?? {};
  const title = TEXT.safeParse(metadata['xesam:title']);
  const artists = ARTISTS.safeParse(metadata['xesam:artist']);
  return {
    player: playerLabel(name),
    title: title.success ? title.data : null,
    artist: artists.success ? artists.data.join(', ') : null,
    status: properties.PlaybackStatus,
  };
}

export class MprisPlayers {
  private readonly players = new Map<string, Player>();
  private readonly stops: (() => void)[] = [];

  constructor(
    private readonly bus: SessionBus,
    private readonly changed: () => void,
    private readonly failed: (cause: unknown) => void,
  ) {}

  async start(): Promise<void> {
    this.stops.push(
      await this.bus.watch(
        { iface: PROPERTIES, member: 'PropertiesChanged', path: PLAYER_PATH },
        (_body, sender) => {
          this.refreshOwner(sender);
        },
      ),
      await this.bus.watch(
        { ...DAEMON, sender: DAEMON.destination, member: 'NameOwnerChanged' },
        (body) => {
          const [name, , owner] = OWNER_CHANGED.parse(body);
          if (name.startsWith(PREFIX)) {
            this.track(name, owner === '' ? null : owner).catch(this.failed);
          }
        },
      ),
    );
    const [names] = NAMES.parse(await this.bus.call({ ...DAEMON, member: 'ListNames' }));
    await Promise.all(
      names.filter((name) => name.startsWith(PREFIX)).map((name) => this.track(name, undefined)),
    );
  }

  stop(): void {
    this.stops.splice(0).forEach((stop) => {
      stop();
    });
    this.players.clear();
  }

  current(): NowPlaying | null {
    const ranked = [...this.players.values()].sort(
      (a, b) =>
        MEDIA_STATUSES.indexOf(a.media.status) - MEDIA_STATUSES.indexOf(b.media.status) ||
        b.changedAt - a.changedAt,
    );
    return ranked[0]?.media ?? null;
  }

  async control(status: MediaStatus): Promise<void> {
    const player = [...this.players.values()].find((item) => item.media === this.current());
    if (player === undefined) {
      throw new NodeFailureError('not_found', 'Nothing is playing on this computer.');
    }
    await this.bus.call({
      destination: player.name,
      path: PLAYER_PATH,
      iface: PLAYER_IFACE,
      member: ACTIONS[status],
    });
  }

  private refreshOwner(owner: string): void {
    const player = [...this.players.values()].find((item) => item.owner === owner);
    if (player !== undefined) {
      this.track(player.name, owner).catch(this.failed);
    }
  }

  private async track(name: string, knownOwner: string | null | undefined): Promise<void> {
    if (knownOwner === null) {
      this.players.delete(name);
      this.changed();
      return;
    }
    const owner =
      knownOwner ??
      OWNER.parse(
        await this.bus.call({ ...DAEMON, member: 'GetNameOwner', signature: 's', body: [name] }),
      )[0];
    const body = await this.bus.call({
      destination: name,
      path: PLAYER_PATH,
      iface: PROPERTIES,
      member: 'GetAll',
      signature: 's',
      body: [PLAYER_IFACE],
    });
    this.players.set(name, { name, owner, media: nowPlaying(name, body), changedAt: Date.now() });
    this.changed();
  }
}
