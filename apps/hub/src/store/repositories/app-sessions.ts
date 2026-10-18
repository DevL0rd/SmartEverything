import { APP_USAGE, type AppUsage } from '@smarteverything/domain';
import type { StoreContext } from '../context';

const USAGE_LIMIT = 20;

export interface NewAppSession {
  readonly deviceId: string;
  readonly appId: string;
  readonly appName: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export class AppSessionsRepository {
  constructor(private readonly context: StoreContext) {}

  add(session: NewAppSession): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the app time',
        `insert into app_sessions (device_id, app_id, app_name, started_at, ended_at, seconds)
         values ($deviceId, $appId, $appName, $startedAt, $endedAt, $seconds)`,
        {
          deviceId: session.deviceId,
          appId: session.appId,
          appName: session.appName,
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt.toISOString(),
          seconds: (session.endedAt.getTime() - session.startedAt.getTime()) / 1000,
        },
      );
    });
  }

  usage(deviceId: string, since: Date): AppUsage[] {
    return this.context.sql.all(
      APP_USAGE,
      `select app_id as appId, max(app_name) as name, sum(seconds) as seconds
       from app_sessions where device_id = $deviceId and started_at >= $since
       group by app_id order by seconds desc limit ${String(USAGE_LIMIT)}`,
      { deviceId, since: since.toISOString() },
    );
  }
}
