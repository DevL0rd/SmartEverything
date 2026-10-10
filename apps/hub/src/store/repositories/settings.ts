import {
  SETTINGS_ROW,
  type IceServer,
  type McpToolName,
  type SettingsRow,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SETTINGS = storedRow(SETTINGS_ROW, {
  json: ['ice_servers', 'webrtc_candidates', 'fitness_goals', 'mcp_disabled_tools'],
});

const COLUMNS =
  'home_name, time_zone, latitude, longitude, location_name, public_url, public_url_checked_at, public_url_verified_at, public_url_error, ice_servers, webrtc_candidates, push_project_id, fitness_goals, max_heart_rate, mcp_disabled_tools, updated_at';

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

const DEFAULT_HOME_NAME = 'Home';

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
