import { join } from 'node:path';
import {
  ROBOT_ACTIVITY_STREAM,
  ROBOT_DRIVER_ID,
  ROBOT_MOVES_STREAM,
  ROBOT_STATUS_STREAM,
  type RobotActivityEntry,
  type RobotMoves,
  type RobotStatus,
} from '@smarteverything/domain';
import type { PluginContext, PluginStop, Unsubscribe } from '../contract';
import { DeviceMirror } from '../device-mirror';
import { ActivityLog } from './activity';
import { aibiSearchEntries } from './aibi-search';
import { aibiTools } from './aibi-tools';
import { TrafficCapture } from './capture';
import type { Cloud } from './cloud';
import { Coalesced } from './coalesce';
import { AibiListeners } from './listeners';
import { VoiceDesk } from './desk';
import { movesOf } from './moves';
import { PatchedFirmwareCache } from './ota-files';
import { Photos } from './photos';
import { performAction, robotExternalId, ROBOT_MIRROR, type RobotSnapshot } from './robot-device';
import { jsonOf, ONLINE_WINDOW_MS, RobotState } from './robot-state';
import { AibiRoutes } from './routes';
import { statusLines } from './status-lines';
import { RobotServer } from './server';
import type { AibiSettings } from './settings';
import { Speeches } from './speech-stream';

type Context = PluginContext<AibiSettings>;

export interface AibiEnvironment {
  readonly cloud: (dnsServer: string) => Cloud;
  readonly address: (configured: string) => Promise<string>;
  readonly now: () => Date;
}

const PUBLISH_DELAY_MS = 250;
const ACTIVITY_SHOWN = 30;
const ACTIVITY_COLLECTION = 'activity';
const STATE_COLLECTION = 'state';
const TRAFFIC_FOLDER = 'traffic';
const SPOKEN_KINDS = ['heard', 'said', 'action'] as const;

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

class AibiRuntime {
  private readonly state: RobotState;
  private readonly activity: ActivityLog;
  private readonly speeches = new Speeches();
  private readonly capture: TrafficCapture;
  private readonly desk: VoiceDesk;
  private readonly server: RobotServer;
  private readonly mirror = new DeviceMirror(ROBOT_MIRROR);
  private readonly publishStatus = new Coalesced((): void => {
    this.sendStatus();
  }, PUBLISH_DELAY_MS);
  private readonly publishActivity = new Coalesced((): void => {
    this.sendActivity();
  }, PUBLISH_DELAY_MS);
  private settings: AibiSettings;
  private moves: RobotMoves;
  private readonly listeners: AibiListeners;
  private offline: NodeJS.Timeout | null = null;
  private speaker: Unsubscribe | null = null;
  private stops: (() => void)[] = [];

  constructor(
    private readonly ctx: Context,
    private readonly environment: AibiEnvironment,
  ) {
    const { settings } = ctx;
    this.settings = settings;
    this.moves = movesOf({ actions: settings.actions, animations: settings.animations });
    this.state = new RobotState(ctx.records(STATE_COLLECTION), () => environment.now());
    this.activity = this.makeActivity();
    this.capture = new TrafficCapture({
      enabled: settings.capture,
      directory: join(ctx.files.folder, TRAFFIC_FOLDER),
      failed: (reason): void => {
        ctx.log.warn('aibi.capture_failed', { reason });
      },
    });
    this.desk = this.makeDesk();
    this.server = new RobotServer(this.makeRoutes());
    this.listeners = new AibiListeners({
      ctx,
      environment,
      state: this.state,
      activity: this.activity,
      server: this.server,
      changed: (): void => {
        this.sendStatus();
      },
    });
  }

  private makeActivity(): ActivityLog {
    return new ActivityLog({
      records: this.ctx.records(ACTIVITY_COLLECTION),
      now: () => this.environment.now(),
      changed: (entry): void => {
        this.activityAdded(entry);
      },
      unreadable: (key, reason): void => {
        this.ctx.log.warn('aibi.activity_unreadable', { key, reason });
      },
    });
  }

  private makeDesk(): VoiceDesk {
    const { ctx } = this;
    return new VoiceDesk({
      settings: () => this.settings,
      voice: ctx.voice,
      assistant: ctx.assistant,
      post: (message): void => {
        ctx.messages.post(message);
      },
      senderId: () => this.senderId(),
      activity: this.activity,
      speeches: this.speeches,
      photos: new Photos(ctx.files.folder),
      report: () => this.state.report,
      changed: (): void => {
        this.publishStatus.trigger();
      },
      now: () => this.environment.now(),
    });
  }

  private makeRoutes(): AibiRoutes {
    return new AibiRoutes({
      mode: () => this.settings.mode,
      desk: this.desk,
      speeches: this.speeches,
      activity: this.activity,
      capture: this.capture,
      folder: this.ctx.files.folder,
      patched: new PatchedFirmwareCache(this.ctx.files.folder),
      contact: (remote, path): void => {
        this.contact(remote, path);
      },
      report: (report): void => {
        this.state.reported(report);
        this.refresh();
      },
      identified: (identity): void => {
        if (this.state.identified(identity)) {
          this.activity.add('firmware', 'AIBI identified itself');
          this.refresh();
          this.identityChanged();
        }
      },
    });
  }

  async start(): Promise<void> {
    this.state.load();
    this.activity.load();
    this.registerTools();
    this.registerDriver();
    this.stops.push(
      this.ctx.settingsChanged((settings): void => {
        this.applySettings(settings);
      }),
    );
    this.stops.push(
      this.ctx.voice.keyChanges((): void => {
        void this.desk.end();
      }),
    );
    this.identityChanged();
    this.scheduleOffline();
    await this.listeners.up();
    this.sendStatus();
    this.sendActivity();
    this.ctx.data.publish(ROBOT_MOVES_STREAM, jsonOf(this.moves));
  }

  async stop(): Promise<void> {
    this.publishStatus.cancel();
    this.publishActivity.cancel();
    if (this.offline !== null) {
      clearTimeout(this.offline);
    }
    this.stops.forEach((stop) => {
      stop();
    });
    this.stops = [];
    this.speaker?.();
    await this.desk.end();
    this.listeners.down();
    this.speeches.clear();
    await this.capture.flushed();
  }

  private senderId(): string {
    const { identity } = this.state;
    return identity === null ? ROBOT_DRIVER_ID : robotExternalId(identity);
  }

  private applySettings(settings: AibiSettings): void {
    const previous = this.settings;
    this.settings = settings;
    this.capture.enable(settings.capture);
    if (
      !sameList(previous.actions, settings.actions) ||
      !sameList(previous.animations, settings.animations)
    ) {
      this.moves = movesOf({ actions: settings.actions, animations: settings.animations });
      this.ctx.data.publish(ROBOT_MOVES_STREAM, jsonOf(this.moves));
    }
    this.registerTools();
    this.identityChanged();
    this.refresh();
  }

  private registerTools(): void {
    const { ctx } = this;
    ctx.tools.register([
      ...aibiTools({
        scopes: this.settings.scopes,
        status: () => this.statusNow(),
        moves: () => this.moves,
        activity: this.activity,
        desk: this.desk,
        assistant: ctx.assistant,
      }),
    ]);
  }

  private registerDriver(): void {
    const { ctx } = this;
    this.stops.push(
      ctx.devices.register({
        id: ROBOT_DRIVER_ID,
        start: ({ sink }) => {
          this.mirror.attach(sink);
          this.mirror.update(this.snapshot());
          return Promise.resolve(() => {
            this.mirror.detach();
            return Promise.resolve();
          });
        },
        execute: (command) =>
          new Promise((resolve) => {
            resolve(performAction(command, this.desk, this.settings.scopes));
          }),
      }),
    );
  }

  private identityChanged(): void {
    this.speaker?.();
    this.speaker = null;
    const { identity } = this.state;
    this.ctx.search.replace(
      aibiSearchEntries(identity === null ? null : robotExternalId(identity), this.moves),
    );
    if (identity !== null && this.settings.scopes.includes('aibi.speak')) {
      this.speaker = this.ctx.reach.register({
        externalId: robotExternalId(identity),
        label: 'AIBI',
        speak: (text) => {
          this.desk.say(text);
          return Promise.resolve();
        },
      });
    }
  }

  private snapshot(): RobotSnapshot {
    return {
      identity: this.state.identity,
      report: this.state.report,
      online: this.state.online(),
      at: this.environment.now().toISOString(),
    };
  }

  private refresh(): void {
    this.mirror.update(this.snapshot());
    this.publishStatus.trigger();
  }

  private contact(remote: string, path: string): void {
    const wasOnline = this.state.online();
    this.state.contacted(remote, path);
    if (!wasOnline) {
      this.activity.add('network', 'AIBI connected', `${remote} asked for ${path}`);
    }
    this.scheduleOffline();
    this.refresh();
  }

  private scheduleOffline(): void {
    if (this.offline !== null) {
      clearTimeout(this.offline);
      this.offline = null;
    }
    const { contact } = this.state;
    if (contact === null) {
      return;
    }
    const left = Date.parse(contact.at) + ONLINE_WINDOW_MS - this.environment.now().getTime();
    if (left <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      this.offline = null;
      this.refresh();
    }, left);
    timer.unref();
    this.offline = timer;
  }

  private activityAdded(entry: RobotActivityEntry): void {
    this.publishActivity.trigger();
    if (SPOKEN_KINDS.some((kind) => kind === entry.kind)) {
      this.publishStatus.trigger();
    }
    if (entry.kind === 'chat') {
      this.ctx.events.emit({
        kind:
          entry.title === 'Conversation started' ? 'conversation_started' : 'conversation_ended',
        subject: entry.title,
        data: {},
      });
      this.publishStatus.trigger();
    }
  }

  private statusNow(): RobotStatus {
    return this.state.status({
      settings: this.settings,
      desk: this.desk.status(),
      configured: this.ctx.voice.ready(),
      lines: statusLines(this.activity),
      now: this.environment.now(),
    });
  }

  private sendStatus(): void {
    this.ctx.data.publish(ROBOT_STATUS_STREAM, jsonOf(this.statusNow()));
  }

  private sendActivity(): void {
    this.ctx.data.publish(
      ROBOT_ACTIVITY_STREAM,
      jsonOf({ entries: this.activity.recent(ACTIVITY_SHOWN) }),
    );
  }
}

export async function startAibi(ctx: Context, environment: AibiEnvironment): Promise<PluginStop> {
  const runtime = new AibiRuntime(ctx, environment);
  await runtime.start();
  return () => runtime.stop();
}
