import {
  AUTOMATION_FUNCTION_EXTRACT_REQUEST,
  type AutomationFunctionExtractReply,
} from '@smarteverything/domain';
import type { Extraction } from '@smarteverything/flow/extract/extract';
import type { FunctionExtractBody } from '../../data/api';

export interface PortDraft {
  readonly label: string;
  readonly description: string;
}

export interface Draft {
  readonly name: string;
  readonly inputs: Readonly<Record<string, PortDraft>>;
  readonly outputs: Readonly<Record<string, PortDraft>>;
  readonly expose: readonly string[];
}

export interface ExtractTarget {
  readonly automationId: string;
  readonly revision: number;
}

export const EMPTY_DRAFT: Draft = { name: '', inputs: {}, outputs: {}, expose: [] };

export function fixedId(item: { readonly key: string; readonly port: string }): string {
  return `${item.key}.${item.port}`;
}

export function initialDraft(extraction: Extraction): Draft {
  return {
    ...EMPTY_DRAFT,
    expose: extraction.fixed.filter((item) => item.of === 'room').map(fixedId),
  };
}

export function toggleExpose(draft: Draft, id: string, on: boolean): Draft {
  const rest = draft.expose.filter((entry) => entry !== id);
  return { ...draft, expose: on ? [...rest, id] : rest };
}

const BLANK_PORT: PortDraft = { label: '', description: '' };

export const KIND_TEXT: Readonly<Record<Extraction['callee']['flavour'], string>> = {
  pure: 'Function · only works out a value from its inputs, with no effects.',
  action: 'Action · runs steps. It changes things or waits, so it is used as a step.',
};

export function setName(draft: Draft, name: string): Draft {
  return { ...draft, name };
}

export function editPort(
  draft: Draft,
  side: 'inputs' | 'outputs',
  port: string,
  change: Partial<PortDraft>,
): Draft {
  const current = draft[side][port] ?? BLANK_PORT;
  return { ...draft, [side]: { ...draft[side], [port]: { ...current, ...change } } };
}

export function portDraft(draft: Draft, side: 'inputs' | 'outputs', port: string): PortDraft {
  return draft[side][port] ?? BLANK_PORT;
}

export function nameIssue(draft: Draft): string | null {
  const name = draft.name.trim();
  if (name === '') return 'Give the node a name.';
  return name.length > 80 ? 'Use 80 characters or fewer.' : null;
}

function portEdits(
  ports: readonly { readonly name: string }[],
  drafts: Readonly<Record<string, PortDraft>>,
): readonly { name: string; label?: string; description?: string }[] {
  return ports.flatMap(({ name }) => {
    const draft = drafts[name];
    const label = draft?.label.trim() ?? '';
    const description = draft?.description.trim() ?? '';
    if (label === '' && description === '') return [];
    return [
      {
        name,
        ...(label === '' ? {} : { label }),
        ...(description === '' ? {} : { description }),
      },
    ];
  });
}

export function extractBody(
  draft: Draft,
  keys: readonly string[],
  target: ExtractTarget,
  extraction: Extraction,
): FunctionExtractBody | null {
  if (nameIssue(draft) !== null) return null;
  const inputs = portEdits(extraction.callee.inputs, draft.inputs);
  const outputs = portEdits(extraction.callee.outputs, draft.outputs);
  const expose = extraction.fixed.filter((item) => draft.expose.includes(fixedId(item)));
  const parsed = AUTOMATION_FUNCTION_EXTRACT_REQUEST.safeParse({
    automationId: target.automationId,
    expectedRevision: target.revision,
    keys,
    name: draft.name.trim(),
    ...(expose.length === 0 ? {} : { expose: expose.map(({ key, port }) => ({ key, port })) }),
    ...(inputs.length === 0 ? {} : { inputs }),
    ...(outputs.length === 0 ? {} : { outputs }),
  });
  return parsed.success ? parsed.data : null;
}

export function madeText(name: string): string {
  return `Made ${name.trim()}`;
}

export function failureText(reply: AutomationFunctionExtractReply): string {
  return reply.problems.find((entry) => entry.severity === 'error')?.message ?? reply.summary;
}
