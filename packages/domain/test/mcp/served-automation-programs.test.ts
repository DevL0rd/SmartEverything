import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_ENDPOINTS } from '../../src/api/endpoints';
import {
  AUTOMATION_FUNCTION_ENDPOINTS,
  AUTOMATION_PROGRAM_ENDPOINTS,
  AUTOMATION_QUESTION_ENDPOINTS,
  AUTOMATION_RUN_ENDPOINTS,
  AUTOMATION_SECRET_ENDPOINTS,
} from '../../src/api';
import { MCP_PART_NAMES } from '../../src/mcp/names';
import {
  AUTOMATION_PROGRAM_PART_ENDPOINTS,
  SERVED_AUTOMATION_PROGRAMS,
} from '../../src/mcp/served-automation-programs';

const SCHEMA_LIMIT = 32000;

const NEW_ENDPOINTS: Readonly<
  Record<
    string,
    { readonly params: z.ZodType; readonly query: z.ZodType; readonly body: z.ZodType }
  >
> = {
  ...AUTOMATION_PROGRAM_ENDPOINTS,
  ...AUTOMATION_FUNCTION_ENDPOINTS,
  ...AUTOMATION_RUN_ENDPOINTS,
  ...AUTOMATION_QUESTION_ENDPOINTS,
  ...AUTOMATION_SECRET_ENDPOINTS,
};

const row = (name: string): (typeof SERVED_AUTOMATION_PROGRAMS)[number] => {
  const found = SERVED_AUTOMATION_PROGRAMS.find((served) => served[0] === name);
  if (found === undefined) {
    throw new Error(`no row ${name}`);
  }
  return found;
};

function shapesOf(schema: z.ZodType): readonly Readonly<Record<string, z.ZodType>>[] {
  if (schema instanceof z.ZodObject) {
    return [schema.shape];
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.flatMap((option) =>
      option instanceof z.ZodType ? shapesOf(option) : [],
    );
  }
  return [];
}

function jsonOf(schema: z.ZodType, reused: 'ref' | 'inline'): string {
  return JSON.stringify(
    z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', reused, cycles: 'ref' }),
  );
}

function publishedInput(parts: Readonly<Record<string, string>>): z.ZodType {
  const uses = new Map<string, Map<string, z.ZodType>>();
  for (const part of Object.values(parts)) {
    const endpointName = new Map<string, string>(AUTOMATION_PROGRAM_PART_ENDPOINTS).get(part);
    const endpoint = endpointName === undefined ? undefined : NEW_ENDPOINTS[endpointName];
    if (endpoint === undefined) {
      throw new Error(`no endpoint for ${part}`);
    }
    for (const shape of [
      ...shapesOf(endpoint.params),
      ...shapesOf(endpoint.query),
      ...shapesOf(endpoint.body),
    ]) {
      for (const [field, schema] of Object.entries(shape)) {
        const distinct = uses.get(field) ?? new Map<string, z.ZodType>();
        distinct.set(jsonOf(schema, 'inline'), schema);
        uses.set(field, distinct);
      }
    }
  }
  const fields = Object.fromEntries(
    [...uses].map(([field, distinct]) => [field, z.optional(z.union([...distinct.values()]))]),
  );
  return z.strictObject({ action: z.enum(Object.keys(parts)), ...fields });
}

describe('the automation program rows', () => {
  it('serve the eight automation tool names in order', () => {
    expect(SERVED_AUTOMATION_PROGRAMS.map((served) => served[0])).toEqual([
      'list_automations',
      'edit_automation',
      'run_automation',
      'stop_automation',
      'read_automation_runs',
      'answer_automation_question',
      'list_values',
      'edit_value',
    ]);
  });

  it('mark reading rows read and changing rows control', () => {
    const access = Object.fromEntries(
      SERVED_AUTOMATION_PROGRAMS.map((served) => [served[0], served[2]]),
    );
    expect(access).toEqual({
      list_automations: 'read',
      edit_automation: 'control',
      run_automation: 'control',
      read_automation_runs: 'read',
      answer_automation_question: 'control',
      stop_automation: 'control',
      list_values: 'read',
      edit_value: 'control',
    });
  });

  it('offer the views, actions and modes of the language', () => {
    const keys = (name: string): string[] => {
      const route = row(name)[5];
      return 'parts' in route ? Object.keys(route.parts) : [];
    };
    expect(keys('list_automations')).toEqual([
      'summary',
      'full',
      'outline',
      'functions',
      'catalog',
      'secrets',
    ]);
    expect(keys('edit_automation')).toEqual([
      'create',
      'update',
      'patch',
      'remove',
      'check',
      'set_secret',
      'remove_secret',
    ]);
    expect(keys('read_automation_runs')).toEqual([
      'list',
      'run',
      'nodes',
      'decisions',
      'questions',
    ]);
    expect(keys('stop_automation')).toEqual(['run', 'automation']);
    expect(keys('edit_value')).toEqual(['create', 'update', 'remove', 'apply']);
    expect(row('run_automation')[4]).toMatch(/mode live.*dry.*simulate.*scenario/u);
    expect(row('edit_automation')[4]).toContain('confirmBreaking');
  });

  it('say that secret values are never read', () => {
    expect(row('list_automations')[4]).toContain('never values');
    expect(row('edit_automation')[4]).toContain('write-only');
  });

  it('give every route value an explanation and every part a unique name known to the endpoints', () => {
    const endpointNames = new Set(
      AUTOMATION_PROGRAM_PART_ENDPOINTS.map(([, endpoint]) => endpoint),
    );
    const known = new Set(Object.keys(NEW_ENDPOINTS));
    for (const [, endpoint] of AUTOMATION_PROGRAM_PART_ENDPOINTS) {
      expect(known.has(endpoint), endpoint).toBe(true);
    }
    expect(endpointNames.size).toBe(AUTOMATION_PROGRAM_PART_ENDPOINTS.length);
    const partNames = new Set<string>(AUTOMATION_PROGRAM_PART_ENDPOINTS.map(([part]) => part));
    for (const served of SERVED_AUTOMATION_PROGRAMS) {
      const route = served[5];
      if ('parts' in route) {
        for (const part of Object.values(route.parts)) {
          expect(partNames.has(part) || new Set<string>(MCP_PART_NAMES).has(part), part).toBe(true);
        }
        expect(Object.keys(route.says)).toEqual(Object.keys(route.parts));
      }
    }
  });

  it('keep the part names that already exist pointing at the same operations', () => {
    const existing = new Set<string>(MCP_PART_NAMES);
    const live = new Set(Object.keys(API_ENDPOINTS));
    for (const [part] of AUTOMATION_PROGRAM_PART_ENDPOINTS) {
      expect(existing.has(part) || !live.has(part)).toBe(true);
    }
  });

  it.each(['inline', 'ref'] as const)(
    'publishes an edit_automation schema under the limit in %s mode',
    (reused) => {
      const route = row('edit_automation')[5];
      if (!('parts' in route)) {
        throw new Error('edit_automation is routed');
      }
      const size = jsonOf(publishedInput(route.parts), reused).length;
      expect(size).toBeGreaterThan(1000);
      expect(size).toBeLessThan(SCHEMA_LIMIT);
    },
  );
});
