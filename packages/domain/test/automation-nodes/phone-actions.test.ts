import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import {
  PHONE_ACTION_KINDS,
  PHONE_TIMEOUT_CHOICES,
} from '../../src/automation-nodes/phone-actions';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';
import { PHONE_ACTION } from '../../src/phones';

const IDS = [
  'phone.ring',
  'phone.sound',
  'phone.media',
  'phone.open',
  'phone.flashlight',
  'phone.screen',
  'phone.toggle',
] as const;

function kindOf(id: string): NonNullable<ReturnType<typeof NODE_REGISTRY.get>> {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`${id} is not registered`);
  return found;
}

function input(id: string, name: string): InputPortDecl | undefined {
  return kindOf(id).inputs.find((port) => port.name === name);
}

function choiceIds(id: string, name: string): readonly string[] {
  const type = input(id, name)?.type;
  return type?.t === 'choice' ? type.options.map((option) => option.id) : [];
}

function accepted(action: Readonly<Record<string, unknown>>): boolean {
  return PHONE_ACTION.safeParse(action).success;
}

describe('phone action kinds registration', () => {
  it('registers the seven kinds once each, valid, as phone effects', () => {
    expect(PHONE_ACTION_KINDS.map((each) => each.id)).toEqual([...IDS]);
    for (const id of IDS) {
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      const kind = kindOf(id);
      expect(kind.class).toBe('effect');
      expect(kind.category).toBe('computers');
      expect(kindProblems(kind), id).toEqual([]);
    }
  });

  it('keeps phone.action for advanced use', () => {
    expect(kindOf('phone.action').inputs.map((port) => port.name)).toEqual(['phone', 'action']);
  });
});

describe('phone action kinds take typed ports with pickers', () => {
  it('has no raw JSON, record or untyped input and only known picker sources', () => {
    for (const id of IDS) {
      for (const port of kindOf(id).inputs) {
        expect(['any', 'record'], `${id}.${port.name}`).not.toContain(port.type.t);
        expect(port.required && port.default !== undefined, `${id}.${port.name}`).toBe(false);
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), `${id}.${port.name}`).toBe(true);
      }
    }
  });

  it('picks the phone as a phone, and ring may take a person instead', () => {
    for (const id of IDS.filter((each) => each !== 'phone.ring'))
      expect(input(id, 'phone')).toMatchObject({
        type: { t: 'ref', of: 'phone' },
        required: true,
        summary: true,
      });
    expect(input('phone.ring', 'phone')).toMatchObject({
      type: { t: 'ref', of: 'phone' },
      required: false,
    });
    expect(input('phone.ring', 'person')).toMatchObject({
      type: { t: 'ref', of: 'person' },
      required: false,
    });
    expect(input('phone.ring', 'on')).toMatchObject({ type: { t: 'boolean' }, default: true });
  });

  it('picks the app from the apps the phone has installed', () => {
    expect(input('phone.open', 'app')?.ui?.optionsFrom).toBe('phone.apps');
  });

  it('offers the sound choices the phone accepts', () => {
    expect(choiceIds('phone.sound', 'ringer')).toEqual(['normal', 'vibrate', 'silent']);
    expect(choiceIds('phone.sound', 'stream')).toEqual(['media', 'ring', 'alarm', 'notification']);
    for (const mode of choiceIds('phone.sound', 'ringer'))
      expect(accepted({ type: 'set_ringer', mode }), mode).toBe(true);
    for (const stream of choiceIds('phone.sound', 'stream'))
      expect(accepted({ type: 'set_volume', stream, percent: 10 }), stream).toBe(true);
  });

  it('offers the media keys and seek', () => {
    expect(choiceIds('phone.media', 'key')).toEqual(['play', 'pause', 'next', 'previous', 'seek']);
    for (const key of choiceIds('phone.media', 'key').filter((each) => each !== 'seek'))
      expect(accepted({ type: 'media', key }), key).toBe(true);
    expect(input('phone.media', 'position')?.type).toEqual({ t: 'duration' });
  });

  it('offers a link, an app or a settings page, with every settings page the phone opens', () => {
    expect(choiceIds('phone.open', 'what')).toEqual(['url', 'app', 'settings']);
    const pages = choiceIds('phone.open', 'page');
    expect(pages).toContain('wifi');
    expect(pages).toContain('app_details');
    for (const page of pages) expect(accepted({ type: 'open_settings', page }), page).toBe(true);
  });

  it('offers the flashlight modes and a level from 1 to 100', () => {
    expect(choiceIds('phone.flashlight', 'mode')).toEqual(['on', 'off', 'toggle']);
    expect(input('phone.flashlight', 'level')).toMatchObject({
      type: { t: 'number', min: 1, max: 100 },
      ui: { min: 1, max: 100, unit: '%' },
    });
  });

  it('offers every screen action and exactly the timeouts the phone can be set to', () => {
    expect(choiceIds('phone.screen', 'action')).toEqual([
      'lock',
      'show_unlock',
      'brightness',
      'auto_brightness',
      'timeout',
    ]);
    expect(choiceIds('phone.screen', 'timeout')).toEqual([
      '15',
      '30',
      '60',
      '120',
      '300',
      '600',
      '1800',
    ]);
    for (const option of PHONE_TIMEOUT_CHOICES)
      expect(accepted({ type: 'set_timeout', seconds: Number(option.id) }), option.id).toBe(true);
    expect(PHONE_TIMEOUT_CHOICES.map((option) => option.label)).toEqual([
      '15 seconds',
      '30 seconds',
      '1 minute',
      '2 minutes',
      '5 minutes',
      '10 minutes',
      '30 minutes',
    ]);
    expect(input('phone.screen', 'brightness')).toMatchObject({
      type: { t: 'number', min: 0, max: 100 },
    });
  });

  it('offers only the system settings an app can change', () => {
    const settings = choiceIds('phone.toggle', 'setting');
    expect(settings).toEqual(['auto_rotate', 'haptic_feedback', 'touch_sounds']);
    for (const setting of settings)
      expect(accepted({ type: 'set_system_toggle', setting, on: true }), setting).toBe(true);
  });

  it('summarises in plain words', () => {
    expect(summaryText(renderSummary(kindOf('phone.flashlight').summary, {}))).toBe(
      'Flashlight … on …',
    );
  });
});

describe('phone action kinds run mode and error exit', () => {
  it('sends by default and may wait for the phone to answer', () => {
    for (const id of IDS) {
      const kind = kindOf(id);
      expect(kind.effect, id).toEqual({
        retry: 'external',
        budget: 'effects',
        mode: 'fire_and_forget',
      });
      expect(modesOf(kind), id).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(true);
      expect(runModeOf(kind, undefined), id).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result'), id).toBe('wait_for_result');
    }
  });

  it('is fallible, carries the shared error output and routes its failure only when wired', () => {
    for (const id of IDS) {
      expect(fallibleOf(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(canRouteOnError(id, STATIC_KIND_LOOKUP), id).toBe(true);
      expect(kindOf(id).outputs.at(-1), id).toBe(ERROR_OUT);
      const wired = execPortsOf(
        id,
        {
          id: '00000000-0000-4000-8000-000000000001',
          key: 'phone',
          kind: id,
          to: { onError: '00000000-0000-4000-8000-000000000002' },
        },
        STATIC_KIND_LOOKUP,
      );
      expect(
        wired.outputs.map((out) => out.port),
        id,
      ).toContain('onError');
      expect(
        execPortsOf(id, undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
        id,
      ).not.toContain('onError');
    }
  });
});
