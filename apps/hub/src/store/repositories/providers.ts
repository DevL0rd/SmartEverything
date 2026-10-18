import { PROVIDER_LINK_ROW, type Provider, type ProviderLinkRow } from '@smarteverything/domain';
import type { ProviderLinkChange } from '../../database/port';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_LINK = storedRow(PROVIDER_LINK_ROW, { json: ['prompt'] });

const COLUMNS =
  'provider, account_label, status, prompt, phase, problem, last_error, device_count, updated_at';

function columnsOf(change: ProviderLinkChange): Record<string, SQLInputValue> {
  return {
    ...(change.status === undefined ? {} : { status: change.status }),
    ...(change.accountLabel === undefined ? {} : { account_label: change.accountLabel }),
    ...(change.prompt === undefined
      ? {}
      : { prompt: change.prompt === null ? null : jsonText(change.prompt) }),
    ...(change.phase === undefined ? {} : { phase: change.phase }),
    ...(change.problem === undefined ? {} : { problem: change.problem }),
    ...(change.lastError === undefined ? {} : { last_error: change.lastError }),
    ...(change.deviceCount === undefined ? {} : { device_count: change.deviceCount }),
  };
}

export class ProvidersRepository {
  constructor(private readonly context: StoreContext) {}

  list(): ProviderLinkRow[] {
    return this.context.sql.all(
      STORED_LINK,
      `select ${COLUMNS} from provider_links order by provider`,
    );
  }

  find(provider: Provider): ProviderLinkRow | undefined {
    return this.context.sql.get(
      STORED_LINK,
      `select ${COLUMNS} from provider_links where provider = $provider`,
      { provider },
    );
  }

  change(provider: Provider, change: ProviderLinkChange): ProviderLinkRow {
    return this.context.write(() => {
      const before = this.find(provider);
      const now = this.context.now();
      if (before === undefined) {
        this.context.sql.run(
          'add the provider link',
          'insert into provider_links (provider, updated_at) values ($provider, $now)',
          { provider, now },
        );
      }
      const set = assignments({ ...columnsOf(change), updated_at: now });
      this.context.sql.run(
        'change the provider link',
        `update provider_links set ${set.text} where provider = $provider`,
        { ...set.parameters, provider },
      );
      const after = found(this.find(provider), 'provider link', provider);
      this.context.changed(
        'provider_links',
        before === undefined ? 'INSERT' : 'UPDATE',
        after,
        before ?? null,
      );
      return after;
    });
  }
}
