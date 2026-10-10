import {
  SIGHT_FRAME_LIMITS,
  SIGHT_SAMPLING,
  type DesktopCaptureKind,
  type DesktopCaptureSource,
  type DesktopStill,
  type SightSource,
} from '@smarteverything/domain';
import {
  desktopCapturer,
  screen,
  systemPreferences,
  type DesktopCapturerSource,
  type Display,
  type NativeImage,
} from 'electron';
import { CaptureEmptyError, CaptureTooLargeError, ScreenAccessError } from './capture-errors.js';

export interface ThumbnailBox {
  readonly width: number;
  readonly height: number;
}

export interface SourceQuery {
  readonly types: readonly DesktopCaptureKind[];
  readonly thumbnail: ThumbnailBox;
  readonly icons: boolean;
}

export const NO_THUMBNAIL: ThumbnailBox = { width: 0, height: 0 };

const LIST_THUMBNAIL: ThumbnailBox = { width: 320, height: 200 };
const LIST_THUMBNAIL_QUALITY = 70;
const ICON_EDGE = 32;
const SCREEN_PREFIX = 'screen:';
const QUALITY_FLOOR = 30;
const QUALITY_STEP = 10;
const PERCENT = 100;

const SIGHT_OF_KIND: Readonly<Record<DesktopCaptureKind, SightSource>> = {
  screen: 'desktop_screen',
  window: 'desktop_window',
};

export const STILL_BOX: ThumbnailBox = {
  width: Math.max(SIGHT_SAMPLING.desktop_screen.longEdge, SIGHT_SAMPLING.desktop_window.longEdge),
  height: Math.max(SIGHT_SAMPLING.desktop_screen.longEdge, SIGHT_SAMPLING.desktop_window.longEdge),
};

export function captureKindOf(sourceId: string): DesktopCaptureKind {
  return sourceId.startsWith(SCREEN_PREFIX) ? 'screen' : 'window';
}

function assertScreenAccess(): void {
  if (process.platform !== 'darwin') {
    return;
  }
  const status = systemPreferences.getMediaAccessStatus('screen');
  if (status === 'denied' || status === 'restricted') {
    throw new ScreenAccessError(status);
  }
}

export async function fetchSources(query: SourceQuery): Promise<readonly DesktopCapturerSource[]> {
  assertScreenAccess();
  return desktopCapturer.getSources({
    types: [...query.types],
    thumbnailSize: query.thumbnail,
    fetchWindowIcons: query.icons,
  });
}

function displayOf(source: DesktopCapturerSource): Display | undefined {
  return screen.getAllDisplays().find((display) => String(display.id) === source.display_id);
}

export function isPrimaryScreen(source: DesktopCapturerSource): boolean {
  return displayOf(source)?.id === screen.getPrimaryDisplay().id;
}

function jpegUrl(image: NativeImage): string | null {
  if (image.isEmpty()) {
    return null;
  }
  return `data:image/jpeg;base64,${image.toJPEG(LIST_THUMBNAIL_QUALITY).toString('base64')}`;
}

function iconUrl(icon: NativeImage): string | null {
  if (icon.isEmpty()) {
    return null;
  }
  const small = icon.resize({ width: ICON_EDGE, height: ICON_EDGE });
  return `data:image/png;base64,${small.toPNG().toString('base64')}`;
}

function describeSource(source: DesktopCapturerSource): DesktopCaptureSource {
  const kind = captureKindOf(source.id);
  const display = kind === 'screen' ? displayOf(source) : undefined;
  return {
    id: source.id,
    kind,
    title: source.name,
    thumbnail: jpegUrl(source.thumbnail),
    appIcon: kind === 'window' ? iconUrl(source.appIcon) : null,
    primary: kind === 'screen' && isPrimaryScreen(source),
    width: display === undefined ? null : Math.round(display.size.width * display.scaleFactor),
    height: display === undefined ? null : Math.round(display.size.height * display.scaleFactor),
  };
}

function isListed(source: DesktopCapturerSource): boolean {
  return captureKindOf(source.id) === 'screen' || source.name !== '';
}

export async function listCaptureSources(): Promise<readonly DesktopCaptureSource[]> {
  const sources = await fetchSources({
    types: ['screen', 'window'],
    thumbnail: LIST_THUMBNAIL,
    icons: true,
  });
  return sources.filter(isListed).map(describeSource);
}

function fitLongEdge(image: NativeImage, longEdge: number): NativeImage {
  const { width, height } = image.getSize();
  const longest = Math.max(width, height);
  if (longest <= longEdge) {
    return image;
  }
  const scale = longEdge / longest;
  return image.resize({
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    quality: 'best',
  });
}

function encodeWithin(image: NativeImage, quality: number, sourceId: string): Buffer {
  const limit = SIGHT_FRAME_LIMITS.maxBytes;
  for (let level = Math.round(quality * PERCENT); level >= QUALITY_FLOOR; level -= QUALITY_STEP) {
    const bytes = image.toJPEG(level);
    if (bytes.length <= limit) {
      return bytes;
    }
  }
  throw new CaptureTooLargeError(sourceId, limit);
}

export function stillOf(source: DesktopCapturerSource): DesktopStill {
  if (source.thumbnail.isEmpty()) {
    throw new CaptureEmptyError(source.id);
  }
  const kind = captureKindOf(source.id);
  const sampling = SIGHT_SAMPLING[SIGHT_OF_KIND[kind]];
  const image = fitLongEdge(source.thumbnail, sampling.longEdge);
  const bytes = encodeWithin(image, sampling.quality, source.id);
  const { width, height } = image.getSize();
  return {
    sourceId: source.id,
    kind,
    title: source.name,
    width,
    height,
    mime: 'image/jpeg',
    dataBase64: bytes.toString('base64'),
  };
}
