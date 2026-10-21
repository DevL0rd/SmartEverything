import { randomUUID } from 'node:crypto';
import {
  ApiError,
  TEMPLATE_SCOPES,
  type AutomationV3,
  type FunctionV3,
  type JsonValue,
} from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import { kindOf, planValue } from '../../src/automations/service-programs-analysis';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import {
  automationOf,
  lit,
  logLine,
  programRig,
  setPower,
  step,
  trigger,
  type ProgramRig,
} from './support/program-rig';

let rig: ProgramRig;

beforeEach(() => {
  captureLogs();
  rig = programRig();
});

afterEach(() => {
  rig.close();
});

let counter = 0;

function create(caller: Caller, definition: AutomationV3): ReturnType<typeof rig.service.create> {
  counter += 1;
  return rig.service.create(caller, { name: `Test ${String(counter)}`, enabled: true, definition });
}

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The call was not refused.');
}

const wake = (): AutomationV3 =>
  automationOf([step('wake', 'ai.wake', { instruction: lit('look around') })]);

function reusableWake(): string {
  const program: FunctionV3 = {
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [step('wake', 'ai.wake', { instruction: lit('look around') })] },
  };
  const lowered = lower(program, { kinds: kindOf });
  if (!lowered.ok) throw new Error(JSON.stringify(lowered.problems));
  const planHash = rig.env.plans.put('function', planValue(lowered.plan));
  return rig.functions.create({
    name: 'Wake',
    program,
    layout: { nodes: {}, frames: [], comments: [] },
    interfaceHash: 'a'.repeat(64),
    compat: 'compatible',
    planHash,
    createdBy: null,
    author: null,
  }).id;
}

describe('who may save what the manifest reaches', () => {
  it('lets only an owner save an automation that wakes the AI', () => {
    const refused = refusal(() => create(rig.member.caller, wake()));
    expect(refused.code).toBe('forbidden');
    expect(refused.message).toMatch(/Only an owner/);
    expect(rig.programs.list()).toHaveLength(0);
    expect(create(rig.owner.caller, wake()).ok).toBe(true);
  });

  it('lets only an owner save an automation that uses a tool', () => {
    const program = automationOf([step('tool', 'tool.call', { tool: lit('home_read') })]);
    expect(refusal(() => create(rig.member.caller, program)).code).toBe('forbidden');
  });

  it('follows calls into reusable nodes, so a member cannot reach the AI through one', () => {
    const functionId = reusableWake();
    const program = automationOf([step('use', 'fn.call', { fn: lit(functionId) })]);
    expect(refusal(() => create(rig.member.caller, program)).code).toBe('forbidden');
    expect(create(rig.owner.caller, program).ok).toBe(true);
  });

  it('keeps a member to their own computers', () => {
    const program = automationOf([
      step('quiet', 'computer.audio', {
        computer: lit(rig.computer.id),
        change: lit({ action: 'mute' }),
      }),
    ]);
    const refused = refusal(() => create(rig.member.caller, program));
    expect(refused.message).toBe('A member can only automate their own computers.');
    expect(create(rig.owner.caller, program).ok).toBe(true);
  });

  it('keeps a member from commanding another person’s phone and allows their own', () => {
    const ownerPhone = rig.addPhone(rig.owner, 'Owner phone');
    const ownPhone = rig.addPhone(rig.member, 'Member phone');
    const launch = (device: string): AutomationV3 =>
      automationOf([setPower('open', device, 'launch_app')]);
    const refused = refusal(() => create(rig.member.caller, launch(ownerPhone.id)));
    expect(refused.message).toBe('Only the person who owns this phone can do this.');
    expect(create(rig.member.caller, launch(ownPhone.id)).ok).toBe(true);
  });

  it('keeps a member to the devices their access reaches', () => {
    const other = rig.addPhone(rig.member, 'Member phone');
    rig.store.personAccess.change(rig.member.profileId, {
      role: 'member',
      template: 'child',
      scopes: {
        ...TEMPLATE_SCOPES.adult,
        devices: { mode: 'only', rooms: [], devices: [other.id] },
      },
    });
    const refused = refusal(() =>
      create(rig.member.caller, automationOf([setPower('lamp', rig.lamp.id)])),
    );
    expect(refused.code).toBe('forbidden');
    expect(create(rig.owner.caller, automationOf([setPower('lamp', rig.lamp.id)])).ok).toBe(true);
  });
});

describe('who and what the saved automation remembers', () => {
  it('records the person, or the assistant for an assistant turn', () => {
    const person = create(rig.owner.caller, automationOf([logLine('say', 'hi')]));
    expect(rig.programs.byId(person.id ?? '').author).toStrictEqual({
      via: 'person',
      profile_id: rig.owner.profileId,
    });
    const service: Caller = {
      kind: 'service',
      authority: {
        event_id: randomUUID(),
        profile_id: rig.owner.profileId,
        client_id: null,
        kind: 'service',
        role: 'owner',
        hub_os_ban: false,
        tools: null,
        plugin_id: null,
        requester: null,
      },
      profileId: rig.owner.profileId,
      chatId: null,
    };
    const assistant = create(service, automationOf([logLine('say', 'hi')]));
    expect(rig.programs.byId(assistant.id ?? '').author).toStrictEqual({
      via: 'assistant',
      profile_id: rig.owner.profileId,
    });
  });

  it('keeps the initiating authority of the effects on every revision', () => {
    const authority = {
      event_id: randomUUID(),
      profile_id: rig.owner.profileId,
      client_id: rig.owner.client.id,
      kind: 'client' as const,
      role: 'owner' as const,
      hub_os_ban: false,
      tools: null,
      plugin_id: null,
      requester: null,
    };
    const result = withExecutionAuthority(authority, () =>
      create(rig.owner.caller, automationOf([logLine('say', 'hi')])),
    );
    const kept = rig.store.harnessRecovery.effects.find('automation', result.id ?? '');
    expect(kept?.profile_id).toBe(rig.owner.profileId);
  });

  it('stores the plugin that wrote it and refuses a tool the plugin may not use', () => {
    const plugin: Caller = {
      kind: 'client',
      client: rig.owner.client,
      pluginId: 'weather-plugin',
      pluginRequester: 'owner',
    };
    const saved = create(plugin, automationOf([logLine('say', 'hi')]));
    expect(rig.programs.byId(saved.id ?? '').origin).toStrictEqual({
      plugin_id: 'weather-plugin',
      requester: 'owner',
    });
    rig.refusedTools.push('home_read');
    const program = automationOf([step('tool', 'tool.call', { tool: lit('home_read') })]);
    expect(refusal(() => create(plugin, program)).message).toMatch(/not available to a plugin/);
  });
});

describe('signal triggers', () => {
  it('refuses a signal source or kind that is not installed', () => {
    const program = automationOf([logLine('say', 'hi')], {
      triggers: [
        trigger('heard', 'trigger.signal', { source: lit('nowhere'), kind: lit('nothing') }),
      ],
    });
    const refused = refusal(() => create(rig.owner.caller, program));
    expect(refused.code).toBe('invalid_request');
  });
});

describe('speech triggers', () => {
  const speech = (phrase: JsonValue): AutomationV3 =>
    automationOf([logLine('say', 'hi')], {
      triggers: [trigger('heard', 'trigger.speech', { phrase: lit(phrase) })],
    });

  it('binds the grant to the saving profile and the saved revision', () => {
    const saved = create(rig.owner.caller, speech('lights on'));
    const grant = rig.store.speech.grant(saved.id ?? '');
    expect(grant?.revision).toBe('1');
    expect(grant?.principal.profileId).toBe(rig.owner.profileId);
  });

  it('moves the grant to the new revision and drops it with the last speech trigger', () => {
    const id = create(rig.owner.caller, speech('lights on')).id ?? '';
    rig.service.update(rig.owner.caller, id, {
      definition: speech('lights off'),
      expectedRevision: 1,
    });
    expect(rig.store.speech.grant(id)?.revision).toBe('2');
    rig.service.update(rig.owner.caller, id, {
      definition: automationOf([logLine('say', 'hi')]),
      expectedRevision: 2,
    });
    expect(rig.store.speech.grant(id)).toBeUndefined();
  });

  it('lets only the initiating profile change a speech automation', () => {
    const id = create(rig.owner.caller, speech('lights on')).id ?? '';
    const other = rig.addPhone(rig.member, 'unused');
    expect(other.kind).toBe('phone');
    const refused = refusal(() =>
      rig.service.update(rig.member.caller, id, {
        definition: speech('lights off'),
        expectedRevision: 1,
      }),
    );
    expect(refused.message).toMatch(/initiating profile/);
    expect(rig.programs.byId(id).revision).toBe(1);
  });

  it('refuses a phrase that is wired', () => {
    const program = automationOf([logLine('say', 'hi')], {
      triggers: [
        trigger('heard', 'trigger.speech', { phrase: { wire: { from: 'trigger', port: 'key' } } }),
      ],
    });
    const refused = create(rig.owner.caller, program);
    expect(refused.ok).toBe(false);
    expect(refused.problems).toContainEqual(
      expect.objectContaining({ code: 'static_not_literal', port: 'phrase', severity: 'error' }),
    );
    expect(rig.programs.list()).toHaveLength(0);
  });
});
