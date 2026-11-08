import { z } from 'zod';

export interface Source {
  readonly label: string;
  readonly select: string;
  readonly update: string;
  readonly byRevision: boolean;
}

export const STORED = z.object({
  id: z.string(),
  revision: z.number(),
  owner: z.string(),
  program: z.string(),
  layout: z.string(),
});

export type Stored = z.infer<typeof STORED>;

const DRAFT_JSON = "json_object('program', json($program), 'layout', json($layout))";

export const SOURCES: readonly Source[] = [
  {
    label: 'automations',
    select: `select id, 0 as revision, 'the automation ' || name as owner, definition as program, layout
      from automations order by id`,
    update: 'update automations set definition = $program, layout = $layout where id = $id',
    byRevision: false,
  },
  {
    label: 'automationDrafts',
    select: `select id, 0 as revision, 'the draft of the automation ' || name as owner,
        json_extract(draft, '$.program') as program, json_extract(draft, '$.layout') as layout
      from automations where draft is not null order by id`,
    update: `update automations set draft = ${DRAFT_JSON} where id = $id`,
    byRevision: false,
  },
  {
    label: 'automationRevisions',
    select: `select r.automation_id as id, r.revision, 'the automation ' || a.name || ' revision ' || r.revision as owner,
        r.definition as program, r.layout
      from automation_revisions r join automations a on a.id = r.automation_id
      order by r.automation_id, r.revision`,
    update: `update automation_revisions set definition = $program, layout = $layout
      where automation_id = $id and revision = $revision`,
    byRevision: true,
  },
  {
    label: 'functionDrafts',
    select: `select id, 0 as revision, 'the draft of the Custom Node ' || name as owner,
        json_extract(draft, '$.program') as program, json_extract(draft, '$.layout') as layout
      from automation_functions where draft is not null order by id`,
    update: `update automation_functions set draft = ${DRAFT_JSON} where id = $id`,
    byRevision: false,
  },
  {
    label: 'functionRevisions',
    select: `select r.function_id as id, r.revision, 'the Custom Node ' || f.name || ' revision ' || r.revision as owner,
        r.definition as program, r.layout
      from automation_function_revisions r join automation_functions f on f.id = r.function_id
      order by r.function_id, r.revision`,
    update: `update automation_function_revisions set definition = $program, layout = $layout
      where function_id = $id and revision = $revision`,
    byRevision: true,
  },
];
