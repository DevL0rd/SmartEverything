import {
  DEFAULT_HOME_NAME,
  EMPTY_IR_REMOTE_STATE,
  SETTINGS_ROW,
  laundryNoticeOf,
  withIrChange,
  withLaundryNoticeChange,
  withRefill,
  type HistorySettings,
  type IceServer,
  type IrRemoteChange,
  type IrRemoteState,
  type LaundryNoticeChange,
  type LaundryNoticeSetting,
  type McpToolName,
  type PauseChoiceMs,
  type SettingsRow,
  type TriggerSettings,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SETTINGS = storedRow(SETTINGS_ROW, {
  json: [
    'ice_servers',
    'webrtc_candidates',
    'fitness_goals',
    'mcp_disabled_tools',
    'history_settings',
    'trigger_settings',
    'device_refills',
    'laundry_notices',
    'ir_remotes',
  ],
});

const COLUMNS =
  'home_name, time_zone, latitude, longitude, location_name, public_url, public_url_checked_at, public_url_verified_at, public_url_error, ice_servers, webrtc_candidates, push_project_id, fitness_goals, max_heart_rate, mcp_disabled_tools, history_settings, trigger_settings, device_refills, laundry_notices, ir_remotes, end_of_speech_pause_ms, ear_host_device_id, updated_at';

export interface HomeChange {
  readonly home_name?: string | undefined;
  readonly time_zone?: string | undefined;
  readonly latitude?: number | null | undefined;
  readonly longitude?: number | null | undefined;
  readonly location_name?: string | null | undefined;
}

export interface NetworkChange {
  readonly ice_servers?: readonly IceServer[] | undefined;
  readonly webrtc_candidates?: readonly string[] | undefined;
}

export type PublicUrlOutcome =
  { readonly verified: true } | { readonly verified: false; readonly reason: string };

export interface TimeZoneStart {
  readonly initialised: boolean;
  readonly from: string;
  readonly to: string;
}

export class SettingsRepository {
  constructor(private readonly context: StoreContext) {}

  ensure(): void {
    this.context.sql.run(
      'create the settings',
      'insert or ignore into settings (id, home_name, updated_at) values (1, $name, $now)',
      { name: DEFAULT_HOME_NAME, now: this.context.now() },
    );
  }

  read(): SettingsRow {
    return found(
      this.context.sql.get(STORED_SETTINGS, `select ${COLUMNS} from settings where id = 1`),
      'settings row',
      '1',
    );
  }

  updateHome(change: HomeChange): SettingsRow {
    const moved = change.latitude !== undefined || change.longitude !== undefined;
    return this.update({
      ...(moved ? { location_name: null } : {}),
      ...Object.fromEntries(Object.entries(change)),
      ...(change.time_zone === undefined ? {} : { time_zone_initialised: 1 }),
    });
  }

  initialiseTimeZone(systemZone: string): TimeZoneStart {
    return this.context.write(() => {
      const before = this.read().time_zone;
      const changed = this.context.sql.run(
        'initialise the home time zone',
        `update settings set time_zone = case when time_zone = 'UTC' then $zone else time_zone end,
          time_zone_initialised = 1 where id = 1 and time_zone_initialised = 0`,
        { zone: systemZone },
      );
      return { initialised: changed > 0, from: before, to: this.read().time_zone };
    });
  }

  updateNetwork(change: NetworkChange): SettingsRow {
    return this.update({
      ...(change.ice_servers === undefined ? {} : { ice_servers: jsonText(change.ice_servers) }),
      ...(change.webrtc_candidates === undefined
        ? {}
        : { webrtc_candidates: jsonText(change.webrtc_candidates) }),
    });
  }

  setPublicUrl(url: string | null): SettingsRow {
    return this.update({
      public_url: url,
      public_url_checked_at: null,
      public_url_verified_at: null,
      public_url_error: null,
    });
  }

  recordPublicUrlCheck(url: string, outcome: PublicUrlOutcome): SettingsRow {
    return this.context.write(() => {
      if (this.read().public_url !== url) {
        return this.read();
      }
      const now = this.context.now();
      return this.update({
        public_url_checked_at: now,
        public_url_verified_at: outcome.verified ? now : null,
        public_url_error: outcome.verified ? null : outcome.reason,
      });
    });
  }

  setPushProject(projectId: string | null): SettingsRow {
    return this.update({ push_project_id: projectId });
  }

  setHistorySettings(history: HistorySettings): SettingsRow {
    return this.update({ history_settings: jsonText(history) });
  }

  setTriggerSettings(triggers: TriggerSettings): SettingsRow {
    return this.update({ trigger_settings: jsonText(triggers) });
  }

  setEndOfSpeechPause(pauseMs: PauseChoiceMs): SettingsRow {
    return this.update({ end_of_speech_pause_ms: pauseMs });
  }

  setEarHost(deviceId: string | null): SettingsRow {
    return this.update({ ear_host_device_id: deviceId });
  }

  recordRefill(deviceId: string): SettingsRow {
    return this.context.write(() =>
      this.update({
        device_refills: jsonText(
          withRefill(this.read().device_refills, deviceId, new Date(this.context.now())),
        ),
      }),
    );
  }

  changeLaundryNotice(deviceId: string, change: LaundryNoticeChange): LaundryNoticeSetting {
    return this.context.write(() => {
      const current = this.read().laundry_notices;
      const next = withLaundryNoticeChange(laundryNoticeOf(current, deviceId), change);
      this.update({ laundry_notices: jsonText({ ...current, [deviceId]: next }) });
      return next;
    });
  }

  irRemote(remoteId: string): IrRemoteState {
    return this.read().ir_remotes[remoteId] ?? EMPTY_IR_REMOTE_STATE;
  }

  changeIrRemote(remoteId: string, change: (state: IrRemoteState) => IrRemoteState): SettingsRow {
    return this.context.write(() => {
      const next = { ...this.read().ir_remotes, [remoteId]: change(this.irRemote(remoteId)) };
      return this.update({ ir_remotes: jsonText(next) });
    });
  }

  setIrRemote(remoteId: string, change: IrRemoteChange): SettingsRow {
    return this.changeIrRemote(remoteId, (state) => withIrChange(state, change));
  }

  forgetIrRemote(remoteId: string): void {
    this.context.write(() => {
      const current = this.read().ir_remotes;
      if (current[remoteId] !== undefined) {
        const rest = Object.entries(current).filter(([id]) => id !== remoteId);
        this.update({ ir_remotes: jsonText(Object.fromEntries(rest)) });
      }
    });
  }

  setDisabledMcpTools(disabled: readonly McpToolName[]): SettingsRow {
    return this.update({ mcp_disabled_tools: jsonText(disabled) });
  }

  private update(values: Readonly<Record<string, SQLInputValue>>): SettingsRow {
    return this.context.write(() => {
      const before = this.read();
      const set = assignments({ ...values, updated_at: this.context.now() });
      this.context.sql.run(
        'change the settings',
        `update settings set ${set.text} where id = 1`,
        set.parameters,
      );
      const after = this.read();
      this.context.changed('settings', 'UPDATE', after, before);
      return after;
    });
  }
}
