import {
  ApiError,
  type DeviceRow,
  type ListeningClaimAnswer,
  type ListeningConfig,
  type ListeningEarNotice,
  type ListeningHubMessage,
  type ListeningPhoneReport,
  type ListeningSegment,
  type ListeningWakeClaim,
  type WakeSensitivity,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { phoneExternalId } from '../phones/phone-device';
import type { Store } from '../store/store';
import type { EarKeywords } from '../wake-name/keyword-lines';
import type { WakeClaims } from '../wake-name/wake-claims';
import type { WakeTest } from '../wake-name/wake-test';
import { dbfsOfPcm } from '../transcripts/line-levels';
import type { DeviceSpeech } from './device-speech';
import type { SpeechSegment } from './speech-segment';
import type { EndOfSpeechPause } from './end-of-speech-pause';
import type { ListeningRegistry } from './listening-registry';

const SAMPLES_PER_MS = 16;
const SNIPPET_SAMPLES = 1000 * SAMPLES_PER_MS;

export interface PhoneEarsOptions {
  readonly store: Pick<Store, 'devices' | 'feed'>;
  readonly registry: Pick<
    ListeningRegistry,
    'wanted' | 'sensitivityOf' | 'powerModeOf' | 'onSwitched' | 'setState' | 'levels'
  >;
  readonly claims: Pick<WakeClaims, 'request'>;
  readonly pause: Pick<EndOfSpeechPause, 'ms' | 'onChange'>;
  readonly keywords: (names: readonly string[], sensitivity: WakeSensitivity) => EarKeywords;
  readonly speech: Pick<DeviceSpeech, 'segment'>;
  readonly test: Pick<WakeTest, 'active' | 'onActive' | 'matched' | 'segment'>;
  readonly names: () => readonly string[];
  readonly online: () => ReadonlySet<string>;
  readonly send: (clientId: string, notice: ListeningEarNotice) => void;
  readonly log: Logger;
}

function pcmOf(base64: string): Int16Array {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length % Int16Array.BYTES_PER_ELEMENT !== 0) {
    throw new ApiError('invalid_request', 'The audio must be 16-bit samples.');
  }
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
}

function segmentOf(segment: ListeningSegment): SpeechSegment {
  return {
    startedAt: Date.parse(segment.at),
    endedAt: Date.parse(segment.endedAt),
    pcm: pcmOf(segment.pcm),
  };
}

function clientOfPhone(device: DeviceRow): string | null {
  const clientId = device.details['clientId'];
  return typeof clientId === 'string' ? clientId : null;
}

export class PhoneEars {
  private readonly sent = new Map<string, string>();
  private unsubscribe: (() => void)[] = [];

  constructor(private readonly options: PhoneEarsOptions) {}

  start(): void {
    const { registry, store } = this.options;
    this.unsubscribe = [
      registry.onSwitched((key) => {
        this.push(key);
      }),
      this.options.test.onActive(() => {
        this.pushAll();
      }),
      this.options.pause.onChange(() => {
        this.pushAll();
      }),
      registry.levels.onWatched((key, watched) => {
        this.tell(key, { kind: 'level', watched });
      }),
      store.feed.subscribeNotices((notice) => {
        if (notice.type === 'assistant_status') this.pushAll();
      }),
    ];
  }

  stop(): void {
    this.unsubscribe.forEach((stop) => {
      stop();
    });
    this.unsubscribe = [];
  }

  config(clientId: string): ListeningConfig {
    const device = this.deviceOf(clientId);
    this.options.registry.setState(device.id, null);
    const config = this.configOf(device.id);
    this.sent.set(device.id, JSON.stringify(config));
    if (this.options.registry.levels.watched(device.id)) {
      this.tell(device.id, { kind: 'level', watched: true });
    }
    return config;
  }

  claim(clientId: string, claim: ListeningWakeClaim): ListeningClaimAnswer {
    const { registry, claims, log } = this.options;
    const device = this.deviceOf(clientId);
    if (!registry.wanted(device.id).wake) {
      log.info('wake.refused', { source: 'phone', deviceId: device.id, reason: 'wake_off' });
      return { granted: false };
    }
    this.options.test.matched({ kind: 'phone', key: device.id }, claim.phrase);
    const preroll = pcmOf(claim.preroll);
    const snippetDbfs =
      preroll.length === 0 ? claim.snippetDbfs : dbfsOfPcm(preroll.subarray(-SNIPPET_SAMPLES));
    const grant = claims.request({ source: 'phone', key: device.id, snippetDbfs });
    log.info('wake.spotted', {
      source: 'phone',
      deviceId: device.id,
      phrase: claim.phrase,
      granted: grant.granted,
      snippetDbfs: Math.round(snippetDbfs * 10) / 10,
      reportedDbfs: Math.round(claim.snippetDbfs * 10) / 10,
      prerollMs: Math.round(preroll.length / SAMPLES_PER_MS),
    });
    if (grant.granted) {
      registry.setState(device.id, 'in_conversation');
      grant.onSuperseded((winner) => {
        registry.setState(device.id, null);
        this.options.send(clientId, {
          type: 'listening_ear',
          message: {
            kind: 'superseded',
            superseded: { winner: { source: winner.source, key: winner.key } },
          },
        });
      });
    }
    return { granted: grant.granted };
  }

  report(clientId: string, report: ListeningPhoneReport): void {
    const { registry } = this.options;
    const device = this.deviceOf(clientId);
    switch (report.kind) {
      case 'level':
        registry.levels.report(device.id, report.dbfs);
        return;
      case 'state':
        registry.setState(device.id, report.state);
        return;
      case 'segment':
        this.segment(device.id, segmentOf(report.segment));
    }
  }

  private segment(deviceId: string, segment: SpeechSegment): void {
    const { registry, speech, test, log } = this.options;
    test.segment({ kind: 'phone', key: deviceId }, segment);
    if (registry.wanted(deviceId).transcribe) {
      speech.segment(deviceId, segment);
    } else if (!test.active()) {
      log.debug('transcripts.segment_refused', { deviceId, reason: 'write_down_off' });
    }
  }

  private configOf(deviceId: string): ListeningConfig {
    const { registry, keywords: keywordsOf, names } = this.options;
    const { wake, transcribe } = registry.wanted(deviceId);
    const sensitivity = registry.sensitivityOf(deviceId);
    const keywords = keywordsOf(names(), sensitivity);
    return {
      wake,
      transcribe: transcribe || this.options.test.active(),
      sensitivity,
      keywords: [...keywords.keywords],
      threshold: keywords.threshold,
      nearMissThreshold: keywords.nearMissThreshold,
      pause_ms: this.options.pause.ms(),
      power_mode: registry.powerModeOf(deviceId),
    };
  }

  private deviceOf(clientId: string): DeviceRow {
    const device = this.options.store.devices.byExternal('local', phoneExternalId(clientId));
    if (device === undefined) {
      throw new ApiError('not_found', 'This phone has not reported yet, so it has no ear.');
    }
    return device;
  }

  private push(deviceId: string): void {
    const clientId = this.clientOf(deviceId);
    if (clientId === null || !this.options.online().has(clientId)) return;
    const config = this.configOf(deviceId);
    const signature = JSON.stringify(config);
    if (this.sent.get(deviceId) === signature) return;
    this.sent.set(deviceId, signature);
    this.options.send(clientId, { type: 'listening_ear', message: { kind: 'config', config } });
  }

  private pushAll(): void {
    [...this.options.online()].forEach((clientId) => {
      const device = this.options.store.devices.byExternal('local', phoneExternalId(clientId));
      if (device !== undefined) this.push(device.id);
    });
  }

  private tell(deviceId: string, message: ListeningHubMessage): void {
    const clientId = this.clientOf(deviceId);
    if (clientId !== null && this.options.online().has(clientId)) {
      this.options.send(clientId, { type: 'listening_ear', message });
    }
  }

  private clientOf(deviceId: string): string | null {
    const device = this.options.store.devices.find(deviceId);
    return device?.kind === 'phone' ? clientOfPhone(device) : null;
  }
}
