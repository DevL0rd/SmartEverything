import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY, type FlowType } from '@smarteverything/domain';
import { repositoryRoot } from './repository-files';

function skill(folder: string): string {
  return readFileSync(join(repositoryRoot, 'packages/harness/skills', folder, 'SKILL.md'), 'utf8');
}

const AUTOMATIONS = skill('smarteverything-automations');
const TRIGGERS = skill('smarteverything-automation-triggers');

const KIND_ID = /`((?:trigger|flow|device|light|lock|health|notify|plugin)\.[a-z_]+)`/gu;

const WEBHOOK_OUTPUTS: readonly string[] = [
  'trigger.method',
  'trigger.body',
  'trigger.headers',
  'trigger.query',
];

function choiceIds(kind: string, port: string): readonly string[] {
  const type: FlowType | undefined = NODE_REGISTRY.get(kind)?.inputs.find(
    (input) => input.name === port,
  )?.type;
  return type?.t === 'choice' ? type.options.map((option) => option.id) : [];
}

function unknownKinds(text: string): readonly string[] {
  return [...text.matchAll(KIND_ID)]
    .map((match) => match[1] ?? '')
    .filter(
      (id) =>
        !NODE_REGISTRY.has(id) &&
        !WEBHOOK_OUTPUTS.includes(id) &&
        !/^(?:trigger\.)?plugin\./u.test(id),
    );
}

describe('the automation triggers skill', () => {
  it('names only node kinds that exist', () => {
    expect(unknownKinds(TRIGGERS)).toEqual([]);
  });

  it.each([
    ['trigger.appliance', 'event'],
    ['trigger.safety', 'kind'],
    ['trigger.vacuum', 'event'],
    ['trigger.phone', 'kind'],
  ])('lists every choice of %s %s', (kind, port) => {
    const ids = choiceIds(kind, port);
    expect(ids.length).toBeGreaterThan(0);
    expect(TRIGGERS).toContain(`\`${kind}\``);
    for (const id of ids) expect(TRIGGERS, `${kind} ${id}`).toContain(id);
  });

  it('teaches the plugin triggers, the core presence signal and the health water total', () => {
    expect(TRIGGERS).toContain('`trigger.plugin.<owner>.<id>`');
    expect(TRIGGERS).toContain('`plugins`');
    expect(TRIGGERS).toMatch(/core `presence` signals `person_arrived` and `person_left`/u);
    expect(TRIGGERS).not.toMatch(/router plugin's signals `person_arrived`/u);
    expect(TRIGGERS).not.toMatch(/no node reads the day's water total/u);
    expect(NODE_REGISTRY.has('health.today')).toBe(true);
    expect(TRIGGERS).toContain('`health.today`');
  });
});

describe('the automations skill', () => {
  it('names only node kinds that exist', () => {
    expect(unknownKinds(AUTOMATIONS)).toEqual([]);
  });

  it('teaches the run mode, the timeout and the If it fails exit in patches', () => {
    expect(AUTOMATIONS).toContain('`mode` and `timeout`');
    expect(AUTOMATIONS).toContain('Connecting from the port `onError`');
    expect(AUTOMATIONS).toContain('`fire_and_forget`');
    expect(AUTOMATIONS).toContain('`wait_for_result`');
    expect(AUTOMATIONS).toContain('`waitOnly`');
    expect(AUTOMATIONS).toContain('`fallible`');
  });

  it('sends the person to a first-class node before tool.call and marks owner only nodes', () => {
    expect(AUTOMATIONS).toMatch(/node that does the job before reaching for `tool\.call`/u);
    expect(AUTOMATIONS).toContain('`lock.set`');
    expect(AUTOMATIONS).toContain('plugin node marked owner');
  });
});
