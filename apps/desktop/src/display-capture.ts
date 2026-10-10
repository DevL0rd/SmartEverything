import type {
  DesktopCaptureMode,
  DesktopCaptureSource,
  DesktopStill,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { app, type DesktopCapturerSource, type Session } from 'electron';
import {
  CaptureChoiceError,
  CaptureModeError,
  CapturePickerCancelledError,
  CaptureSourceGoneError,
} from './capture-errors.js';
import { captureModeOf } from './capture-mode.js';
import { readDisplayEnvironment } from './environment.js';
import {
  captureKindOf,
  fetchSources,
  isPrimaryScreen,
  listCaptureSources,
  NO_THUMBNAIL,
  STILL_BOX,
  stillOf,
  type ThumbnailBox,
} from './capture-sources.js';
import { isAppOrigin } from './origin.js';

const log = new Logger('desktop.capture');

const CHOICE_FRESH_MS = 15_000;

interface CapturedVideo {
  readonly id: string;
  readonly name: string;
}

interface Choice {
  readonly video: CapturedVideo;
  readonly at: number;
}

interface DisplayRequest {
  readonly securityOrigin: string;
  readonly videoRequested: boolean;
}

type Answer = (streams: { readonly video: CapturedVideo } | null) => void;

export function currentCaptureMode(): DesktopCaptureMode {
  return captureModeOf({
    platform: process.platform,
    ozoneSwitch: app.commandLine.getSwitchValue('ozone-platform'),
    ...readDisplayEnvironment(),
  });
}

export function prepareScreenCapture(mode: DesktopCaptureMode): void {
  if (mode === 'portal') {
    app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
  }
}

function videoOf(source: DesktopCapturerSource): CapturedVideo {
  return { id: source.id, name: source.name };
}

export class DisplayCapture {
  readonly mode: DesktopCaptureMode;
  readonly #startUrl: string;
  #choice: Choice | null = null;

  constructor(mode: DesktopCaptureMode, startUrl: string) {
    this.mode = mode;
    this.#startUrl = startUrl;
  }

  attach(session: Session): void {
    session.setDisplayMediaRequestHandler((request, callback) => {
      this.#answer(request, callback);
    });
  }

  listSources(): Promise<readonly DesktopCaptureSource[]> {
    this.#requirePicker('listCaptureSources');
    return listCaptureSources();
  }

  async choose(sourceId: string | null): Promise<void> {
    this.#requirePicker('chooseCaptureSource');
    if (sourceId === null) {
      this.#choice = null;
      return;
    }
    const sources = await fetchSources({
      types: [captureKindOf(sourceId)],
      thumbnail: NO_THUMBNAIL,
      icons: false,
    });
    const source = sources.find((candidate) => candidate.id === sourceId);
    if (source === undefined) {
      throw new CaptureSourceGoneError(sourceId);
    }
    this.#choice = { video: videoOf(source), at: Date.now() };
  }

  async still(sourceId: string | null): Promise<DesktopStill> {
    return stillOf(await this.#stillSource(sourceId));
  }

  #requirePicker(operation: string): void {
    if (this.mode !== 'picker') {
      throw new CaptureModeError(operation, this.mode, 'the in-app picker mode');
    }
  }

  #portalStillSource(sourceId: string | null): Promise<DesktopCapturerSource> {
    if (sourceId !== null) {
      throw new CaptureModeError('captureStill with a source id', this.mode, 'no source id');
    }
    return this.#portalSource(STILL_BOX);
  }

  async #portalSource(thumbnail: ThumbnailBox): Promise<DesktopCapturerSource> {
    const [source] = await fetchSources({ types: ['screen', 'window'], thumbnail, icons: false });
    if (source === undefined) {
      throw new CapturePickerCancelledError();
    }
    return source;
  }

  async #stillSource(sourceId: string | null): Promise<DesktopCapturerSource> {
    if (this.mode === 'portal') {
      return this.#portalStillSource(sourceId);
    }
    const kind = sourceId === null ? 'screen' : captureKindOf(sourceId);
    const sources = await fetchSources({ types: [kind], thumbnail: STILL_BOX, icons: false });
    const source =
      sourceId === null
        ? (sources.find(isPrimaryScreen) ?? sources[0])
        : sources.find((candidate) => candidate.id === sourceId);
    if (source === undefined) {
      throw new CaptureSourceGoneError(sourceId ?? 'the primary screen');
    }
    return source;
  }

  #answer(request: DisplayRequest, callback: Answer): void {
    const refusal = this.#refusalOf(request);
    if (refusal !== null) {
      log.warn('desktop.capture.refused', { mode: this.mode, reason: refusal });
      callback(null);
      return;
    }
    this.#pickVideo().then(
      (video) => {
        log.info('desktop.capture.granted', { mode: this.mode, source: video.id });
        callback({ video });
      },
      (cause: unknown) => {
        log.error('desktop.capture.failed', cause, { mode: this.mode });
        callback(null);
      },
    );
  }

  #refusalOf(request: DisplayRequest): 'untrusted_origin' | 'no_video' | null {
    if (!isAppOrigin(request.securityOrigin, this.#startUrl)) {
      return 'untrusted_origin';
    }
    return request.videoRequested ? null : 'no_video';
  }

  async #pickVideo(): Promise<CapturedVideo> {
    if (this.mode === 'portal') {
      return videoOf(await this.#portalSource(NO_THUMBNAIL));
    }
    return this.#takeChoice();
  }

  #takeChoice(): CapturedVideo {
    const choice = this.#choice;
    this.#choice = null;
    if (choice === null) {
      throw new CaptureChoiceError('missing');
    }
    if (Date.now() - choice.at > CHOICE_FRESH_MS) {
      throw new CaptureChoiceError('stale');
    }
    return choice.video;
  }
}
