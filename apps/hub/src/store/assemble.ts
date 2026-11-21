import type { Logger } from '@smarteverything/logging';
import { costRolledUp } from './cost-rollup';
import { Ledger } from '../ledger/ledger';
import { StoreContext } from './context';
import type { ChangeFeed } from './feed';
import type { DriveFolders } from '../data-layout/drive-folders';
import { assistantRepositories } from './repositories/areas/assistant';
import { automationRepositories } from './repositories/areas/automation';
import { computerRepositories } from './repositories/areas/computers';
import { driveRepositories } from './repositories/areas/drive';
import { healthRepositories } from './repositories/areas/health';
import { homeRepositories } from './repositories/areas/home';
import { peopleRepositories } from './repositories/areas/people';
import { photoRepositories } from './repositories/areas/photos';
import { plannerRepositories } from './repositories/areas/planner';
import { platformRepositories } from './repositories/areas/platform';
import { SettingsRepository } from './repositories/settings';
import type { Sql } from './sql';

const repositoriesOf = (context: StoreContext, log: Logger, driveFolders: DriveFolders | null) =>
  ({
    ...homeRepositories(context, log),
    ...computerRepositories(context),
    ...driveRepositories(context, driveFolders),
    ...automationRepositories(context),
    ...healthRepositories(context),
    ...plannerRepositories(context),
    ...assistantRepositories(context),
    ...peopleRepositories(context),
    ...photoRepositories(context),
    ...platformRepositories(context),
  }) as const;

export type Repositories = ReturnType<typeof repositoriesOf>;

export interface AssembledStore {
  readonly context: StoreContext;
  readonly settings: SettingsRepository;
  readonly ledger: Ledger;
  readonly repositories: Repositories;
}

export interface AssemblyOptions {
  readonly log: Logger;
  readonly now: () => Date;
  readonly driveFolders: DriveFolders | null;
}

export function assembledStore(
  sql: Sql,
  feed: ChangeFeed,
  options: AssemblyOptions,
): AssembledStore {
  const context = new StoreContext(sql, feed, options.now);
  const settings = new SettingsRepository(context);
  const repositories = repositoriesOf(context, options.log, options.driveFolders);
  return {
    context,
    settings,
    ledger: new Ledger(context, feed, () => settings.read().time_zone, costRolledUp(repositories)),
    repositories,
  };
}
