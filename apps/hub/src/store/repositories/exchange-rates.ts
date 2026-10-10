import { EXCHANGE_RATES_ROW, type ExchangeRatesRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_RATES = storedRow(EXCHANGE_RATES_ROW, { json: ['rates'] });

const COLUMNS = 'id, rates, rate_date, fetched_at, next_fetch_at, error, failed_at, updated_at';

export interface RatesFetched {
  readonly rates: Readonly<Record<string, number>>;
  readonly rateDate: string;
  readonly nextFetchAt: string;
}

export interface RatesFailed {
  readonly error: string;
  readonly nextFetchAt: string;
}

export class ExchangeRatesRepository {
  constructor(private readonly context: StoreContext) {}

  ensure(): void {
    this.context.sql.run(
      'create the exchange rates row',
      `insert or ignore into exchange_rates (id, updated_at) values ('usd', $now)`,
      { now: this.context.now() },
    );
  }

  read(): ExchangeRatesRow {
    return found(
      this.context.sql.get(STORED_RATES, `select ${COLUMNS} from exchange_rates where id = 'usd'`),
      'exchange rates row',
      'usd',
    );
  }

  fetched(result: RatesFetched): ExchangeRatesRow {
    return this.update({
      rates: jsonText(result.rates),
      rate_date: result.rateDate,
      fetched_at: this.context.now(),
      next_fetch_at: result.nextFetchAt,
      error: null,
      failed_at: null,
    });
  }

  failed(result: RatesFailed): ExchangeRatesRow {
    return this.update({
      next_fetch_at: result.nextFetchAt,
      error: result.error,
      failed_at: this.context.now(),
    });
  }

  private update(values: Readonly<Record<string, SQLInputValue>>): ExchangeRatesRow {
    return this.context.write(() => {
      const before = this.read();
      const { text, parameters } = assignments({ ...values, updated_at: this.context.now() });
      this.context.sql.run(
        'update the exchange rates',
        `update exchange_rates set ${text} where id = 'usd'`,
        parameters,
      );
      const after = this.read();
      this.context.changed('exchange_rates', 'UPDATE', after, before);
      return after;
    });
  }
}
