import {
  PLUGIN_AUTOMATION,
  WATCH_SPORT,
  pluginNodeModes,
  type PluginNode,
  type PluginOptionPage,
  type WatchFace,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { bindArgs } from '../../src/automations/plugin-kinds/args';
import { createKindCatalog } from '../../src/automations/plugin-kinds/catalog';
import { ANSWER_TIMEOUT_MS } from '../../src/local/pending-answers';
import {
  WATCH_ACTION_TOOL,
  WATCH_ALARM_TOOL,
  WATCH_AUTOMATION,
  WATCH_ERROR_CODES,
  WATCH_FACE_TOOL,
  registerWatchAutomation,
  watchFaceOptions,
} from '../../src/local/watch-automation';
import { expectContributionValid } from '../../src/plugins/builtin/automation-kit';
import { optionPage } from '../../src/plugins/builtin/automation-kit-pages';

const NO_RUNTIME = { tools: [], options: {} };

const ACTION = 'plugin.driver_watch.action';

const ALARM = 'plugin.driver_watch.alarm';

const FACE = 'plugin.driver_watch.face';

const WATCH_ID = 'watch-1';

const DECLARED = PLUGIN_AUTOMATION.parse(WATCH_AUTOMATION.automation);

const CHOICE = z.object({ t: z.literal('choice'), options: z.array(z.object({ id: z.string() })) });

const CHOICE_LIST = z.object({ t: z.literal('list'), of: CHOICE });

function nodeOf(id: string): PluginNode {
  const node = DECLARED.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`no node ${id}`);
  return node;
}

function readyIds(page: PluginOptionPage): readonly string[] {
  if (page.state !== 'ready') throw new Error(page.message);
  return page.options.map((option) => option.id);
}

describe('the watch automation declaration', () => {
  it('is valid and runs only the three tools the driver names', () => {
    const assembled = expectContributionValid(
      { driver: WATCH_AUTOMATION },
      { tools: [WATCH_ACTION_TOOL.name, WATCH_ALARM_TOOL.name, WATCH_FACE_TOOL.name] },
    );
    expect(assembled.owner).toBe('driver:watch');
    expect(assembled.rejections).toEqual([]);
    expect(assembled.kinds.map((kind) => kind.id).sort()).toEqual([ACTION, ALARM, FACE].sort());
  });

  it('is served by the catalog under the driver origin and removed again', () => {
    const catalog = createKindCatalog();
    const stop = registerWatchAutomation(catalog, NO_RUNTIME);
    expect(catalog.get(ACTION)).toMatchObject({
      class: 'effect',
      category: 'plugins',
      origin: { kind: 'driver', id: 'watch', name: 'Watch' },
      access: 'owner',
    });
    expect([ACTION, ALARM, FACE].every((id) => catalog.has(id))).toBe(true);
    stop();
    expect([ACTION, ALARM, FACE].some((id) => catalog.has(id))).toBe(false);
  });

  it('sends commands without waiting and lets every node wait for the watch', () => {
    for (const id of ['action', 'alarm', 'face']) {
      expect(pluginNodeModes(nodeOf(id))).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
    }
  });

  it('waits no longer than the phone is given to answer and gives the watch answer as detail', () => {
    for (const id of ['action', 'alarm', 'face']) {
      expect(nodeOf(id).timeout).toEqual({ default: ANSWER_TIMEOUT_MS, max: ANSWER_TIMEOUT_MS });
    }
    expect(nodeOf('action').outputs).toMatchObject([
      { name: 'detail', type: { t: 'text' }, from: '/detail' },
    ]);
    expect(nodeOf('action').waitOnly).toEqual(['detail']);
  });

  it('maps every refusal the watch can give onto an error class of the error exit', () => {
    for (const id of ['action', 'alarm', 'face']) {
      expect(nodeOf(id).errors).toEqual({
        [WATCH_ERROR_CODES.unreachable]: 'Unreachable',
        [WATCH_ERROR_CODES.unanswered]: 'Timeout',
        [WATCH_ERROR_CODES.refused]: 'Refused',
        [WATCH_ERROR_CODES.notFound]: 'NotFound',
      });
    }
  });
});

describe('the pickers of the watch nodes', () => {
  const catalog = createKindCatalog();
  registerWatchAutomation(catalog, NO_RUNTIME);
  const typeOf = (kind: string, port: string): unknown =>
    catalog.get(kind)?.inputs.find((candidate) => candidate.name === port)?.type;

  it('pick the watch among wearables only', () => {
    for (const kind of [ACTION, ALARM, FACE]) {
      expect(typeOf(kind, 'watch')).toEqual({ t: 'ref', of: 'device', families: ['wearable'] });
    }
  });

  it('offer the seven actions and every sport the watch knows, the sport left out unless needed', () => {
    expect(typeOf(ACTION, 'action')).toMatchObject({
      t: 'choice',
      options: [
        { id: 'find_watch' },
        { id: 'stop_finding' },
        { id: 'sync' },
        { id: 'start_workout' },
        { id: 'pause_workout' },
        { id: 'resume_workout' },
        { id: 'stop_workout' },
      ],
    });
    expect(CHOICE.parse(typeOf(ACTION, 'sport')).options.map((option) => option.id)).toEqual([
      ...WATCH_SPORT.options,
    ]);
    expect(catalog.get(ACTION)?.inputs.find((port) => port.name === 'sport')?.required).toBe(false);
  });

  it('take the alarm as a time of day, a list of weekdays and an on switch', () => {
    expect(typeOf(ALARM, 'time')).toEqual({ t: 'timeOfDay' });
    expect(typeOf(ALARM, 'on')).toEqual({ t: 'boolean' });
    const ports = catalog.get(ALARM)?.inputs ?? [];
    expect(ports.find((port) => port.name === 'days')).toMatchObject({
      required: false,
      default: [],
    });
    expect(ports.find((port) => port.name === 'on')).toMatchObject({
      required: false,
      default: true,
    });
    expect(ports.find((port) => port.name === 'time')?.required).toBe(true);
    const days = CHOICE_LIST.parse(typeOf(ALARM, 'days'));
    expect(days.of.options.map((option) => option.id)).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun',
    ]);
  });

  it('pick the face from the watch faces entity the driver declares', () => {
    expect(typeOf(FACE, 'face')).toEqual({ t: 'entity', of: 'watch.face' });
    expect(DECLARED.entities).toEqual([
      { id: 'face', title: 'Watch face', plural: 'Watch faces', options: 'faces' },
    ]);
  });
});

describe('the arguments the watch nodes hand to their tools', () => {
  it('start a workout with the sport picked', () => {
    const args = bindArgs(nodeOf('action').run.args, {
      watch: WATCH_ID,
      action: 'start_workout',
      sport: 'outdoor_running',
    });
    expect(WATCH_ACTION_TOOL.input.parse(args)).toEqual({
      device: WATCH_ID,
      action: 'start_workout',
      sport: 'outdoor_running',
    });
  });

  it('find the watch without a sport', () => {
    const args = bindArgs(nodeOf('action').run.args, { watch: WATCH_ID, action: 'find_watch' });
    expect(WATCH_ACTION_TOOL.input.parse(args)).toEqual({
      device: WATCH_ID,
      action: 'find_watch',
    });
  });

  it('refuse a sport the watch does not know', () => {
    const args = bindArgs(nodeOf('action').run.args, {
      watch: WATCH_ID,
      action: 'start_workout',
      sport: 'curling',
    });
    expect(WATCH_ACTION_TOOL.input.safeParse(args).success).toBe(false);
  });

  it('set the alarm at a time on chosen days', () => {
    const args = bindArgs(nodeOf('alarm').run.args, {
      watch: WATCH_ID,
      time: '06:45',
      days: ['mon', 'tue'],
      on: false,
    });
    expect(WATCH_ALARM_TOOL.input.parse(args)).toEqual({
      device: WATCH_ID,
      time: '06:45',
      days: ['mon', 'tue'],
      enabled: false,
    });
  });

  it('refuse an alarm time that is not a clock time', () => {
    const args = bindArgs(nodeOf('alarm').run.args, {
      watch: WATCH_ID,
      time: '25:00',
      days: [],
      on: true,
    });
    expect(WATCH_ALARM_TOOL.input.safeParse(args).success).toBe(false);
  });

  it('change the face by its id', () => {
    const args = bindArgs(nodeOf('face').run.args, { watch: WATCH_ID, face: 'face-9' });
    expect(WATCH_FACE_TOOL.input.parse(args)).toEqual({ device: WATCH_ID, face: 'face-9' });
  });
});

function face(index: number, active = false): WatchFace {
  return { id: `face-${String(index)}`, name: `Face ${String(index)}`, active, removable: true };
}

describe('the watch face picker', () => {
  it('lists each face once even when several watches have it and marks the one showing', () => {
    const options = watchFaceOptions([face(1), face(2, true), face(1)]);
    expect(options.map((option) => option.id)).toEqual(['face-1', 'face-2']);
    expect(options.find((option) => option.id === 'face-2')?.detail).toBe('Showing now');
    expect(options.find((option) => option.id === 'face-1')?.detail).toBeNull();
  });

  it('pages through every face with no cap on how many exist', () => {
    const options = watchFaceOptions(Array.from({ length: 130 }, (_, index) => face(index)));
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = optionPage(options, after === undefined ? {} : { after });
      seen.push(...readyIds(page));
      after = page.state === 'ready' ? (page.next ?? undefined) : undefined;
    } while (after !== undefined);
    expect(seen).toEqual(options.map((option) => option.id));
  });

  it('finds faces by name and by id', () => {
    const options = watchFaceOptions([
      { ...face(1), name: 'Neon clock' },
      { ...face(2), name: 'Classic' },
    ]);
    expect(readyIds(optionPage(options, { q: 'neon' }))).toEqual(['face-1']);
    expect(readyIds(optionPage(options, { ids: 'face-2,gone' }))).toEqual(['face-2']);
  });
});
