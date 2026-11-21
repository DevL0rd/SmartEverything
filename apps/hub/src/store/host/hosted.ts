import type { Repositories } from '../assemble';
import type { StoreHost } from './host';

type HostedMethod<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never;

export type Hosted<T> = { readonly [K in keyof T]: HostedMethod<T[K]> };

export type HostedRepository<
  R extends keyof Repositories,
  M extends keyof Repositories[R],
> = Hosted<Pick<Repositories[R], M>>;

export function hostGoogleAccounts(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'googleAccounts', 'find' | 'insert' | 'update' | 'remove'> {
  return {
    find: (...args) => host.call('googleAccounts', 'find', ...args),
    insert: (...args) => host.call('googleAccounts', 'insert', ...args),
    update: (...args) => host.call('googleAccounts', 'update', ...args),
    remove: (...args) => host.call('googleAccounts', 'remove', ...args),
  };
}

export function hostGoogleSyncState(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'googleSyncState', 'find' | 'put' | 'byChannel'> {
  return {
    find: (...args) => host.call('googleSyncState', 'find', ...args),
    put: (...args) => host.call('googleSyncState', 'put', ...args),
    byChannel: (...args) => host.call('googleSyncState', 'byChannel', ...args),
  };
}

export function hostTaskItems(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<
  'plannerItems',
  'find' | 'list' | 'trashed' | 'update' | 'insert' | 'byGoogle' | 'trash' | 'purge' | 'byId'
> {
  return {
    find: (...args) => host.call('plannerItems', 'find', ...args),
    list: (...args) => host.call('plannerItems', 'list', ...args),
    trashed: (...args) => host.call('plannerItems', 'trashed', ...args),
    update: (...args) => host.call('plannerItems', 'update', ...args),
    insert: (...args) => host.call('plannerItems', 'insert', ...args),
    byGoogle: (...args) => host.call('plannerItems', 'byGoogle', ...args),
    trash: (...args) => host.call('plannerItems', 'trash', ...args),
    purge: (...args) => host.call('plannerItems', 'purge', ...args),
    byId: (...args) => host.call('plannerItems', 'byId', ...args),
  };
}

export function hostTaskCollections(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'plannerCollections', 'list' | 'byGoogle' | 'update' | 'insert'> {
  return {
    list: (...args) => host.call('plannerCollections', 'list', ...args),
    byGoogle: (...args) => host.call('plannerCollections', 'byGoogle', ...args),
    update: (...args) => host.call('plannerCollections', 'update', ...args),
    insert: (...args) => host.call('plannerCollections', 'insert', ...args),
  };
}

export function hostGoogleSyncLog(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'googleSyncLog', 'byId' | 'replaceChoice' | 'insert' | 'list'> {
  return {
    byId: (...args) => host.call('googleSyncLog', 'byId', ...args),
    replaceChoice: (...args) => host.call('googleSyncLog', 'replaceChoice', ...args),
    insert: (...args) => host.call('googleSyncLog', 'insert', ...args),
    list: (...args) => host.call('googleSyncLog', 'list', ...args),
  };
}

export function hostRepairInbox(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'aiRepairInbox', 'observe' | 'mayAutoAdmit'> {
  return {
    observe: (...args) => host.call('aiRepairInbox', 'observe', ...args),
    mayAutoAdmit: (...args) => host.call('aiRepairInbox', 'mayAutoAdmit', ...args),
  };
}

export function hostAutomationPrograms(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'automations', 'find' | 'list'> {
  return {
    find: (...args) => host.call('automations', 'find', ...args),
    list: (...args) => host.call('automations', 'list', ...args),
  };
}

export function hostRunRecords(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'automationRunRecords', 'summaries' | 'summariesOf' | 'summaryById'> {
  return {
    summaries: (...args) => host.call('automationRunRecords', 'summaries', ...args),
    summariesOf: (...args) => host.call('automationRunRecords', 'summariesOf', ...args),
    summaryById: (...args) => host.call('automationRunRecords', 'summaryById', ...args),
  };
}

export function hostRunNodes(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'automationRunNodes', 'forRun' | 'ofNode'> {
  return {
    forRun: (...args) => host.call('automationRunNodes', 'forRun', ...args),
    ofNode: (...args) => host.call('automationRunNodes', 'ofNode', ...args),
  };
}

export function hostAutomationDecisions(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'automationDecisions', 'forAutomation'> {
  return {
    forAutomation: (...args) => host.call('automationDecisions', 'forAutomation', ...args),
  };
}

export function hostAutomationTests(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'automationTests', 'list' | 'byId' | 'save' | 'remove'> {
  return {
    list: (...args) => host.call('automationTests', 'list', ...args),
    byId: (...args) => host.call('automationTests', 'byId', ...args),
    save: (...args) => host.call('automationTests', 'save', ...args),
    remove: (...args) => host.call('automationTests', 'remove', ...args),
  };
}

export function hostFoods(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'foods', 'remember' | 'cached'> {
  return {
    remember: (...args) => host.call('foods', 'remember', ...args),
    cached: (...args) => host.call('foods', 'cached', ...args),
  };
}

export function hostDeviceMetrics(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'deviceMetrics', 'saveMinutes' | 'rollHours' | 'prune' | 'series'> {
  return {
    saveMinutes: (...args) => host.call('deviceMetrics', 'saveMinutes', ...args),
    rollHours: (...args) => host.call('deviceMetrics', 'rollHours', ...args),
    prune: (...args) => host.call('deviceMetrics', 'prune', ...args),
    series: (...args) => host.call('deviceMetrics', 'series', ...args),
  };
}

export function hostSubscriptionHistory(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'aiWeeklySubscriptionHistory', 'observe' | 'changed'> {
  return {
    observe: (...args) => host.call('aiWeeklySubscriptionHistory', 'observe', ...args),
    changed: (...args) => host.call('aiWeeklySubscriptionHistory', 'changed', ...args),
  };
}

export function hostHarnessConfiguration(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'harnessConfiguration', 'record' | 'reports' | 'report'> {
  return {
    record: (...args) => host.call('harnessConfiguration', 'record', ...args),
    reports: (...args) => host.call('harnessConfiguration', 'reports', ...args),
    report: (...args) => host.call('harnessConfiguration', 'report', ...args),
  };
}

export function hostSkillUpdates(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'harnessSkillUpdates', 'read' | 'replace'> {
  return {
    read: (...args) => host.call('harnessSkillUpdates', 'read', ...args),
    replace: (...args) => host.call('harnessSkillUpdates', 'replace', ...args),
  };
}

export function hostMemoryRows(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<
  'aiMemories',
  | 'visible'
  | 'change'
  | 'split'
  | 'remove'
  | 'find'
  | 'unembedded'
  | 'setEmbedding'
  | 'embeddings'
  | 'add'
  | 'settings'
  | 'changeSettings'
  | 'recalled'
  | 'forgetHome'
  | 'forgetPerson'
> {
  return {
    visible: (...args) => host.call('aiMemories', 'visible', ...args),
    change: (...args) => host.call('aiMemories', 'change', ...args),
    split: (...args) => host.call('aiMemories', 'split', ...args),
    remove: (...args) => host.call('aiMemories', 'remove', ...args),
    find: (...args) => host.call('aiMemories', 'find', ...args),
    unembedded: (...args) => host.call('aiMemories', 'unembedded', ...args),
    setEmbedding: (...args) => host.call('aiMemories', 'setEmbedding', ...args),
    embeddings: (...args) => host.call('aiMemories', 'embeddings', ...args),
    add: (...args) => host.call('aiMemories', 'add', ...args),
    settings: (...args) => host.call('aiMemories', 'settings', ...args),
    changeSettings: (...args) => host.call('aiMemories', 'changeSettings', ...args),
    recalled: (...args) => host.call('aiMemories', 'recalled', ...args),
    forgetHome: (...args) => host.call('aiMemories', 'forgetHome', ...args),
    forgetPerson: (...args) => host.call('aiMemories', 'forgetPerson', ...args),
  };
}

export function hostMemoryChats(
  host: Pick<StoreHost, 'call'>,
): HostedRepository<'aiChats', 'find' | 'latest'> {
  return {
    find: (...args) => host.call('aiChats', 'find', ...args),
    latest: (...args) => host.call('aiChats', 'latest', ...args),
  };
}
