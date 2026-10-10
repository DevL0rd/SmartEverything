import { APP_USAGE, type AppUsage } from '@smarteverything/domain';
import type { StoreContext } from '../context';

const KEEP_DAYS = 90;
const DAY_MS = 86_400_000;
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
    const before = new Date(session.endedAt.getTime() - KEEP_DAYS * DAY_MS).toISOString();
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
      this.context.sql.run(
        'forget old app time',
        'delete from app_sessions where ended_at < $before',
        {
          before,
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
