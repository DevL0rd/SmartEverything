import type {
  AutomationV4,
  FunctionRevisionRow,
  FunctionRow,
  FunctionV4,
  NodeKindLookup,
  StoredAutomationRow,
} from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import { Logger } from '@smarteverything/logging';
import type { Store } from '../../store/store';
import { readAutomation, structuredFunction } from '../../store/repositories/automation-trees';
import { jsonRecord } from '../engine-v3-start';
import type { KindLedger } from './catalog';
import { rewriteProgramKinds, usedKindIds, type KindMigration } from './versions';

const log = new Logger('hub.plugin-kinds');

type LedgerStore = Pick<
  Store,
  'pluginKinds' | 'automations' | 'automationFunctions' | 'automationPlans'
>;

type UsageStore = Pick<Store, 'automations' | 'automationFunctions'>;

export function usedKindsOf(store: UsageStore): ReadonlySet<string> {
  const used = new Set<string>();
  const programs = [
    ...store.automations
      .list()
      .flatMap((row) => [row.definition, ...(row.draft === null ? [] : [row.draft.program])]),
    ...store.automationFunctions
      .list()
      .map((row) => store.automationFunctions.latest(row.id).definition),
  ];
  for (const program of programs) for (const kind of usedKindIds(program)) used.add(kind);
  return used;
}

interface Migrating {
  readonly store: LedgerStore;
  readonly kinds: NodeKindLookup;
  readonly migrations: readonly KindMigration[];
}

function planHashOf(context: Migrating, program: AutomationV4): string | null {
  const read = readAutomation(program, context.kinds);
  if (!read.ok) {
    log.error('plugin_kinds.migration_not_a_graph', undefined, {
      problems: read.problems.map((problem) => problem.message),
    });
    return null;
  }
  const lowered = lower(read.tree, { kinds: (id) => context.kinds.get(id) });
  if (!lowered.ok) {
    log.error('plugin_kinds.migration_lowering_failed', undefined, {
      problems: lowered.problems.map((problem) => problem.message),
    });
    return null;
  }
  return context.store.automationPlans.put('automation', jsonRecord(lowered.plan));
}

interface Migrated {
  readonly revision: number;
  readonly rewritten: number;
}

function migrateDefinition(context: Migrating, row: StoredAutomationRow): Migrated | null {
  const { program, rewritten } = rewriteProgramKinds(row.definition, context.migrations);
  if (rewritten === 0) return { revision: row.revision, rewritten };
  const planHash = planHashOf(context, program);
  if (planHash === null) return null;
  const saved = context.store.automations.replace(
    row.id,
    {
      program,
      layout: row.layout,
      expectedRevision: row.revision,
      planHash,
      author: null,
    },
    context.kinds,
  );
  return { revision: saved.revision, rewritten };
}

function migrateDraft(context: Migrating, row: StoredAutomationRow, revision: number): number {
  if (row.draft === null) return 0;
  const { program, rewritten } = rewriteProgramKinds(row.draft.program, context.migrations);
  if (rewritten === 0) return 0;
  context.store.automations.saveDraft(
    row.id,
    { program, layout: row.draft.layout },
    revision,
    context.kinds,
  );
  return rewritten;
}

function migrateRow(context: Migrating, row: StoredAutomationRow): void {
  const definition = migrateDefinition(context, row);
  if (definition === null) {
    log.error('plugin_kinds.migration_skipped', undefined, { automationId: row.id });
    return;
  }
  const { revision } = definition;
  const rewritten = definition.rewritten + migrateDraft(context, row, revision);
  if (rewritten === 0) return;
  log.info('plugin_kinds.programs_migrated', {
    automationId: row.id,
    kinds: context.migrations.map((migration) => migration.kindId),
    rewritten,
    revision,
  });
}

function functionPlanHash(context: Migrating, program: FunctionV4): string | null {
  const lowered = lower(structuredFunction(program, context.kinds), {
    kinds: (id) => context.kinds.get(id),
  });
  if (!lowered.ok) {
    log.error('plugin_kinds.migration_lowering_failed', undefined, {
      problems: lowered.problems.map((problem) => problem.message),
    });
    return null;
  }
  return context.store.automationPlans.put('function', jsonRecord(lowered.plan));
}

function migrateFunctionRevision(
  context: Migrating,
  row: FunctionRow,
  latest: FunctionRevisionRow,
): Migrated | null {
  const { program, rewritten } = rewriteProgramKinds(latest.definition, context.migrations);
  if (rewritten === 0) return { revision: row.latest_revision, rewritten };
  const planHash = functionPlanHash(context, program);
  if (planHash === null) return null;
  const saved = context.store.automationFunctions.revise(
    row.id,
    {
      program,
      layout: latest.layout,
      interfaceHash: latest.interface_hash,
      compat: 'compatible',
      planHash,
      author: null,
      expectedRevision: row.latest_revision,
    },
    context.kinds,
  );
  return { revision: saved.latest_revision, rewritten };
}

function migrateFunctionDraft(context: Migrating, row: FunctionRow, revision: number): number {
  if (row.draft === null) return 0;
  const { program, rewritten } = rewriteProgramKinds(row.draft.program, context.migrations);
  if (rewritten === 0) return 0;
  context.store.automationFunctions.saveDraft(
    row.id,
    { program, layout: row.draft.layout },
    revision,
    context.kinds,
  );
  return rewritten;
}

function migrateFunction(context: Migrating, row: FunctionRow): void {
  const definition = migrateFunctionRevision(
    context,
    row,
    context.store.automationFunctions.latest(row.id),
  );
  if (definition === null) {
    log.error('plugin_kinds.migration_skipped', undefined, { functionId: row.id });
    return;
  }
  const rewritten = definition.rewritten + migrateFunctionDraft(context, row, definition.revision);
  if (rewritten === 0) return;
  log.info('plugin_kinds.functions_migrated', {
    functionId: row.id,
    kinds: context.migrations.map((migration) => migration.kindId),
    rewritten,
    revision: definition.revision,
  });
}

export function migratePrograms(
  store: LedgerStore,
  kinds: NodeKindLookup,
  migrations: readonly KindMigration[],
): void {
  const context: Migrating = { store, kinds, migrations };
  for (const row of store.automations.list()) {
    try {
      migrateRow(context, row);
    } catch (cause) {
      log.error('plugin_kinds.migration_failed', cause, { automationId: row.id });
    }
  }
  for (const row of store.automationFunctions.list()) {
    try {
      migrateFunction(context, row);
    } catch (cause) {
      log.error('plugin_kinds.migration_failed', cause, { functionId: row.id });
    }
  }
}

export function kindLedger(store: LedgerStore, kinds: () => NodeKindLookup): KindLedger {
  return {
    stored: (owner) => store.pluginKinds.forOwner(owner),
    row: (kindId) => store.pluginKinds.find(kindId),
    migrated: (migrations): void => {
      if (migrations.length > 0) migratePrograms(store, kinds(), migrations);
    },
  };
}
