import { z } from 'zod';

const FIRST = 0;

const PARAM = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (typeof value === 'string' ? value : (value[FIRST] ?? '')))
  .pipe(z.string().min(1));

const EDIT = z.literal('1');

export interface GroupPageParams {
  readonly member: string | null;
  readonly edit: boolean;
  readonly focus: string | null;
}

export const NO_PARAMS: GroupPageParams = { member: null, edit: false, focus: null };

function field(raw: unknown, name: string): unknown {
  return typeof raw === 'object' && raw !== null ? Reflect.get(raw, name) : undefined;
}

export function parseGroupPageParams(raw: unknown): GroupPageParams {
  const member = PARAM.safeParse(field(raw, 'member'));
  const focus = PARAM.safeParse(field(raw, 'focus'));
  return {
    member: member.success ? member.data : null,
    edit: EDIT.safeParse(field(raw, 'edit')).success,
    focus: focus.success ? focus.data : null,
  };
}

const ID = z.string().min(1);

export function routeId(raw: unknown): string | null {
  const parsed = PARAM.pipe(ID).safeParse(raw);
  return parsed.success ? parsed.data : null;
}
