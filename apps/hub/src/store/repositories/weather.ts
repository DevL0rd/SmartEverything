import { WEATHER_ROW, type WeatherForecast, type WeatherRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_WEATHER = storedRow(WEATHER_ROW, { json: ['forecast'] });

const COLUMNS = 'id, forecast, fetched_at, next_fetch_at, error, air_error, failed_at, updated_at';

export interface WeatherFetched {
  readonly forecast: WeatherForecast;
  readonly airError: string | null;
  readonly nextFetchAt: string;
}

export interface WeatherFailed {
  readonly error: string;
  readonly nextFetchAt: string;
}

export class WeatherRepository {
  constructor(private readonly context: StoreContext) {}

  ensure(): void {
    this.context.sql.run(
      'create the weather row',
      `insert or ignore into weather (id, updated_at) values ('home', $now)`,
      { now: this.context.now() },
    );
  }

  read(): WeatherRow {
    return found(
      this.context.sql.get(STORED_WEATHER, `select ${COLUMNS} from weather where id = 'home'`),
      'weather row',
      'home',
    );
  }

  fetched(result: WeatherFetched): WeatherRow {
    const now = this.context.now();
    return this.update({
      forecast: jsonText(result.forecast),
      fetched_at: now,
      next_fetch_at: result.nextFetchAt,
      error: null,
      air_error: result.airError,
      failed_at: null,
    });
  }

  failed(result: WeatherFailed): WeatherRow {
    return this.update({
      next_fetch_at: result.nextFetchAt,
      error: result.error,
      failed_at: this.context.now(),
    });
  }

  cleared(): WeatherRow {
    return this.update({
      forecast: null,
      fetched_at: null,
      next_fetch_at: null,
      error: null,
      air_error: null,
      failed_at: null,
    });
  }

  private update(values: Readonly<Record<string, SQLInputValue>>): WeatherRow {
    return this.context.write(() => {
      const before = this.read();
      const { text, parameters } = assignments({ ...values, updated_at: this.context.now() });
      this.context.sql.run(
        'update the weather',
        `update weather set ${text} where id = 'home'`,
        parameters,
      );
      const after = this.read();
      this.context.changed('weather', 'UPDATE', after, before);
      return after;
    });
  }
}
