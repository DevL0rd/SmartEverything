import { z } from 'zod';

export interface Source {
  readonly label: string;
  readonly select: string;
  readonly update: string;
  readonly remove?: string;
  readonly byRevision: boolean;
}

export const STORED = z.object({
  id: z.string(),
  revision: z.number(),
  owner: z.string(),
  text: z.string(),
  old: z.number(),
  plan: z.string().nullable(),
});

export type Stored = z.infer<typeof STORED>;

export const SOURCES: readonly Source[] = [
  {
    label: 'automations',
    select: `select id, 0 as revision, 'the automation ' || name as owner, definition as text, 0 as old, null as plan
      from automations`,
    update: 'update automations set definition = $text where id = $id',
    byRevision: false,
  },
  {
    label: 'automationDrafts',
    select: `select id, 0 as revision, 'the draft of the automation ' || name as owner, draft as text, 0 as old, null as plan
      from automations where draft is not null`,
    update: 'update automations set draft = $text where id = $id',
    byRevision: false,
  },
  {
    label: 'automationRevisions',
    select: `select r.automation_id as id, r.revision, 'the automation ' || a.name || ' revision ' || r.revision as owner,
        r.definition as text, r.revision < a.revision as old, r.plan_hash as plan
      from automation_revisions r join automations a on a.id = r.automation_id`,
    update:
      'update automation_revisions set definition = $text where automation_id = $id and revision = $revision',
    remove: 'delete from automation_revisions where automation_id = $id and revision = $revision',
    byRevision: true,
  },
  {
    label: 'functionDrafts',
    select: `select id, 0 as revision, 'the draft of the Custom Node ' || name as owner, draft as text, 0 as old, null as plan
      from automation_functions where draft is not null`,
    update: 'update automation_functions set draft = $text where id = $id',
    byRevision: false,
  },
  {
    label: 'functionRevisions',
    select: `select r.function_id as id, r.revision, 'the Custom Node ' || f.name || ' revision ' || r.revision as owner,
        r.definition as text, r.revision < f.latest_revision as old, r.plan_hash as plan
      from automation_function_revisions r join automation_functions f on f.id = r.function_id`,
    update:
      'update automation_function_revisions set definition = $text where function_id = $id and revision = $revision',
    remove:
      'delete from automation_function_revisions where function_id = $id and revision = $revision',
    byRevision: true,
  },
];

export const PLAN_OWNERS = `select 'the automation ' || a.name || ' revision ' || r.revision as owner
    from automation_revisions r join automations a on a.id = r.automation_id where r.plan_hash = $hash
  union select 'the Custom Node ' || f.name || ' revision ' || r.revision
    from automation_function_revisions r join automation_functions f on f.id = r.function_id where r.plan_hash = $hash
  union select 'a run of the automation ' || a.name
    from automation_runs u join automations a on a.id = u.automation_id where u.plan_hash = $hash`;

export const PLAN_REFERENCES: readonly string[] = [
  'update automation_revisions set plan_hash = $next where plan_hash = $hash',
  'update automation_function_revisions set plan_hash = $next where plan_hash = $hash',
  'update automation_runs set plan_hash = $next where plan_hash = $hash',
  'update automation_runs set plan_refs = replace(plan_refs, $hash, $next) where instr(plan_refs, $hash) > 0',
  'update automation_runs set state = replace(state, $hash, $next) where instr(state, $hash) > 0',
];

const RUNS_OF_PLAN = 'select id from automation_runs where plan_hash = $hash';

export const PLAN_RUN_REMOVALS: readonly string[] = [
  `delete from automation_run_commands where run_id in (${RUNS_OF_PLAN})`,
  `delete from automation_questions where run_id in (${RUNS_OF_PLAN})`,
  `delete from automation_run_nodes where run_id in (${RUNS_OF_PLAN})`,
];

export const PLAN_RUNS_REMOVAL = 'delete from automation_runs where plan_hash = $hash';

export const PLAN_RUN_COUNT =
  'select count(*) as count from automation_runs where plan_hash = $hash';
