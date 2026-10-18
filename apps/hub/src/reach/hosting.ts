import type { AiOutreachRow, DeviceRow, TalkChannelRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HostedCall, ReachOpening } from '../assistant-voice/outreach';
import { hostedUnder } from '../assistant-voice/plugin-caller';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import { cameraConversation, type CameraParts } from './camera-conversation';
import type { CameraFraming } from './camera-framing';
import { channelConversation, type OpenLive } from './channel-conversation';
import { computerConversation, computerOpening, type ComputerParts } from './computer-conversation';
import type { HostVoice, HostedVoiceDeps } from './hosted-call';
import { ReachRefusedError } from './reach-errors';
import type { Asker } from './reach-guards';
import { STARTED_HINT, cameraOpening, channelOpening } from './reach-text';
import { background, messageOf } from '@smarteverything/logging';

export interface HostingOptions {
  readonly store: Pick<Store, 'aiOutreach'>;
  readonly host: HostVoice;
  readonly camera: CameraParts;
  readonly computer: ComputerParts;
  readonly framing: CameraFraming;
  readonly openLive: OpenLive;
  readonly chatFor: (asker: Asker, label: string) => string;
  readonly aiName: () => string;
  readonly liveVideo: () => boolean;
  readonly muteMic: () => boolean;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface LiveSpec {
  readonly how: 'camera' | 'channel' | 'desktop';
  readonly target: string;
  readonly label: string;
  readonly reason: string;
}

export class Hosting {
  private readonly hosted = new Map<string, HostedCall>();

  constructor(private readonly options: HostingOptions) {}

  camera(
    asker: Asker,
    camera: { readonly device: DeviceRow; readonly label: string },
    reason: string,
    heard?: () => Int16Array,
  ): Promise<AiOutreachRow> {
    const { device, label } = camera;
    const live = this.options.liveVideo();
    const row = this.live(asker, { how: 'camera', target: device.id, label, reason });
    this.guarded('frame', () => {
      this.options.framing.begin(row.id, device);
    });
    return this.hostOrFail(row, () =>
      cameraConversation(
        { ...this.voiceDeps(), camera: this.options.camera },
        {
          cameraId: device.id,
          cameraName: label,
          caller: hostedUnder(
            {
              profileId: asker.profileId,
              role: asker.role,
              label,
              machine: { name: label, kind: 'camera', room: null },
            },
            asker.origin,
          ),
          opening: this.opening(
            row,
            cameraOpening({ id: device.id, name: label }, reason, heard !== undefined, live),
          ),
          ...(heard === undefined ? {} : { heard }),
          liveVideo: live,
          muteMic: this.options.muteMic(),
        },
      ),
    );
  }

  computer(
    asker: Asker,
    computer: { readonly device: DeviceRow; readonly label: string },
    reason: string,
    heard?: () => Int16Array,
  ): Promise<AiOutreachRow> {
    const { device, label } = computer;
    const row = this.live(asker, { how: 'desktop', target: device.id, label, reason });
    const tap = this.options.computer.activity.begin({
      callId: row.id,
      device: { kind: 'computer', id: device.id },
      profileId: profileOf(device),
    });
    tap.phase('connecting');
    return this.hostOrFail(row, () =>
      computerConversation(
        { ...this.voiceDeps(), computer: this.options.computer },
        {
          computerId: device.id,
          computerName: label,
          caller: hostedUnder(
            {
              profileId: asker.profileId,
              role: asker.role,
              label,
              machine: { name: label, kind: 'computer', room: null },
            },
            asker.origin,
          ),
          opening: this.opening(row, computerOpening(label, reason, heard !== undefined)),
          ...(heard === undefined ? {} : { heard }),
          muteMic: this.options.muteMic(),
          tap,
        },
      ),
    );
  }

  channel(asker: Asker, channel: TalkChannelRow, reason: string): Promise<AiOutreachRow> {
    const row = this.live(asker, {
      how: 'channel',
      target: channel.id,
      label: channel.name,
      reason,
    });
    return this.hostOrFail(row, () =>
      channelConversation(
        { ...this.voiceDeps(), openLive: this.options.openLive },
        {
          channelId: channel.id,
          channelName: channel.name,
          label: this.options.aiName(),
          caller: hostedUnder(
            { profileId: asker.profileId, role: asker.role, label: channel.name },
            asker.origin,
          ),
          opening: this.opening(row, channelOpening(channel.name, reason)),
        },
      ),
    );
  }

  call(outreachId: string): HostedCall | undefined {
    return this.hosted.get(outreachId);
  }

  ended(outreachId: string): void {
    this.hosted.delete(outreachId);
    this.guarded('restore', () => {
      this.options.framing.restore(outreachId);
    });
  }

  restoreAll(): void {
    this.guarded('restore_all', () => {
      this.options.framing.restoreAll();
    });
  }

  stop(): void {
    [...this.hosted.values()].forEach((call) => {
      background(call.end('hung_up'), 'call.end_failed');
    });
  }

  private live(asker: Asker, spec: LiveSpec): AiOutreachRow {
    return this.options.store.aiOutreach.add({
      profile_id: asker.profileId,
      chat_id: this.options.chatFor(asker, `Talking via ${spec.label}`.slice(0, 80)),
      from_chat_id: asker.chatId,
      how: spec.how,
      target: spec.target,
      target_label: spec.label,
      reason: spec.reason.slice(0, 500),
      urgent: false,
      state: 'live',
      detail: STARTED_HINT,
      expires_at: null,
      origin: asker.origin ?? null,
    });
  }

  private opening(row: AiOutreachRow, text: string): ReachOpening {
    if (row.chat_id === null) {
      throw new ReachRefusedError('The chat for this conversation is gone.');
    }
    return { chatId: row.chat_id, text, outreachId: row.id };
  }

  private async hostOrFail(
    row: AiOutreachRow,
    start: () => Promise<HostedCall>,
  ): Promise<AiOutreachRow> {
    try {
      this.hosted.set(row.id, await start());
      return this.options.store.aiOutreach.byId(row.id);
    } catch (cause) {
      const reason = messageOf(cause);
      this.options.store.aiOutreach.step(row.id, { state: 'failed', detail: reason });
      this.ended(row.id);
      this.options.log.warn('reach.host_failed', { outreachId: row.id, reason });
      throw cause instanceof ReachRefusedError ? cause : new ReachRefusedError(reason);
    }
  }

  private guarded(step: string, work: () => void): void {
    try {
      work();
    } catch (cause) {
      this.options.log.error('reach.camera_framing_failed', cause, { step });
    }
  }

  private voiceDeps(): HostedVoiceDeps {
    return { host: this.options.host, clock: this.options.clock, log: this.options.log };
  }
}

function profileOf(device: DeviceRow): string | null {
  const profile = device.details['profileId'];
  return typeof profile === 'string' ? profile : null;
}
