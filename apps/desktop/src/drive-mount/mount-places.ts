import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { messageOf, type Logger } from '@smarteverything/logging';

export interface MountPlace {
  readonly placementId: string;
  readonly point: string;
  readonly name: string;
}

export interface PlacesFs {
  readonly read: (file: string) => Promise<string | null>;
  readonly write: (file: string, text: string) => Promise<void>;
}

export interface PlacesFiles {
  readonly kde: string;
  readonly gtk: string;
  readonly area: string;
}

const KDE_ID = 'smarteverything-mount/';
const BOOKMARK = /[ \t]*<bookmark\b[^>]*>[\s\S]*?<\/bookmark>[ \t]*\r?\n?/g;
const XBEL_END = '</xbel>';
const KDE_ICON = 'folder-network';

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function uriOf(point: string): string {
  return pathToFileURL(point).href;
}

function kdeEntryOf(place: MountPlace): string {
  return [
    ` <bookmark href="${escapeXml(uriOf(place.point))}">`,
    `  <title>${escapeXml(place.name)}</title>`,
    '  <info>',
    '   <metadata owner="http://freedesktop.org">',
    `    <bookmark:icon name="${KDE_ICON}"/>`,
    '   </metadata>',
    '   <metadata owner="http://www.kde.org">',
    `    <ID>${KDE_ID}${escapeXml(place.placementId)}</ID>`,
    '    <isSystemItem>false</isSystemItem>',
    '   </metadata>',
    '  </info>',
    ' </bookmark>',
    '',
  ].join('\n');
}

export function kdePlacesWith(text: string, places: readonly MountPlace[]): string {
  const kept = text.replace(BOOKMARK, (entry) => (entry.includes(`<ID>${KDE_ID}`) ? '' : entry));
  const end = kept.lastIndexOf(XBEL_END);
  if (end < 0) throw new KdePlacesUnreadableError();
  return `${kept.slice(0, end)}${places.map(kdeEntryOf).join('')}${kept.slice(end)}`;
}

export function gtkBookmarksWith(
  text: string | null,
  area: string,
  places: readonly MountPlace[],
): string {
  const ours = `${uriOf(area)}/`;
  const kept = (text ?? '').split('\n').filter((line) => line !== '' && !line.startsWith(ours));
  const added = places.map((place) => `${uriOf(place.point)} ${place.name}`);
  return [...kept, ...added].map((line) => `${line}\n`).join('');
}

export class KdePlacesUnreadableError extends Error {
  override readonly name = 'KdePlacesUnreadableError';

  constructor() {
    super('The KDE places file has no closing xbel element');
  }
}

export class MountPlaces {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly files: PlacesFiles,
    private readonly fs: PlacesFs,
    private readonly log: Logger,
  ) {}

  show(places: readonly MountPlace[]): Promise<void> {
    this.queue = this.queue.then(() => this.write(places));
    return this.queue;
  }

  private async write(places: readonly MountPlace[]): Promise<void> {
    await Promise.all([this.writeKde(places), this.writeGtk(places)]);
  }

  private async writeKde(places: readonly MountPlace[]): Promise<void> {
    try {
      const text = await this.fs.read(this.files.kde);
      if (text === null) return;
      const next = kdePlacesWith(text, places);
      if (next !== text) await this.fs.write(this.files.kde, next);
    } catch (cause) {
      this.log.warn('drive_mount.places_kde_failed', { error: messageOf(cause) });
    }
  }

  private async writeGtk(places: readonly MountPlace[]): Promise<void> {
    try {
      const text = await this.fs.read(this.files.gtk);
      if (text === null && places.length === 0) return;
      const next = gtkBookmarksWith(text, this.files.area, places);
      if (next !== text) await this.fs.write(this.files.gtk, next);
    } catch (cause) {
      this.log.warn('drive_mount.places_gtk_failed', { error: messageOf(cause) });
    }
  }
}

export function placesFilesOf(
  env: Readonly<Record<string, string | undefined>>,
  home: string,
  area: string,
): PlacesFiles {
  const data = env['XDG_DATA_HOME'] ?? path.join(home, '.local', 'share');
  const config = env['XDG_CONFIG_HOME'] ?? path.join(home, '.config');
  return {
    kde: path.join(data, 'user-places.xbel'),
    gtk: path.join(config, 'gtk-3.0', 'bookmarks'),
    area,
  };
}

export const nodePlacesFs: PlacesFs = {
  read: async (file) => {
    try {
      return await readFile(file, 'utf8');
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
      throw cause;
    }
  },
  write: async (file, text) => {
    await mkdir(path.dirname(file), { recursive: true });
    const staged = `${file}.smarteverything-new`;
    await writeFile(staged, text, 'utf8');
    await rename(staged, file);
  },
};
