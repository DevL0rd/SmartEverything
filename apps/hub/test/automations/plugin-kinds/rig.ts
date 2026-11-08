import { z } from 'zod';
import type { ActionMode, JsonValue } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import type { EventInsert } from '../../../src/database/port';
import type {
  HubTool,
  HubToolResult,
  ToolCaller,
  ToolSource,
} from '../../../src/ai-tools/hub-tool';
import { ToolHub } from '../../../src/ai-tools/tool-hub';
import type { EffectRun } from '../../../src/automations/effects/effect-run';
import { performer } from '../../../src/automations/engine-v3-effects';
import { pluginNodeEffects } from '../../../src/automations/plugin-kinds/perform';
import { SignalBus } from '../../../src/signals/bus';
import type { Store } from '../../../src/store/store';
import { testLogger } from '../../support/logs';
import { testRun, type TestRun } from '../../automations-v3/effects/support';

export const AT = '2026-10-25T10:00:00.000Z';

export const SINGLE_INPUT = z.toJSONSchema(
  z.strictObject({ channelId: z.string(), body: z.string().optional() }),
);

export const LIST_INPUT = z.toJSONSchema(
  z.strictObject({ channelId: z.array(z.string()), body: z.string().optional() }),
);

function hubTool(name: string, schema: Record<string, unknown>): HubTool {
  return {
    name: `chat-hub__${name}`,
    title: name,
    description: name,
    inputSchema: schema,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    origin: { kind: 'plugin', pluginId: 'chat-hub' },
    humanOnly: false,
  };
}

export interface Call {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly caller: ToolCaller;
}

export interface Rig {
  readonly perform: (
    kind: string,
    params: EffectRequest['params'],
    mode?: ActionMode,
    run?: EffectRun,
  ) => Promise<unknown>;
  readonly calls: Call[];
  readonly events: EventInsert[];
  readonly answer: (result: Promise<HubToolResult>) => void;
  readonly answerWith: (reply: (call: Call) => Promise<HubToolResult>) => void;
  readonly offered: string[];
  readonly bus: SignalBus;
  readonly run: TestRun;
  readonly listening: () => { readonly open: number; readonly total: number };
}

export interface RigOptions {
  readonly schema?: Record<string, unknown>;
}

export function request(
  kind: string,
  params: EffectRequest['params'],
  mode?: ActionMode,
): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'external',
    budget: 'effects',
    ...(mode === undefined ? {} : { mode }),
  };
}

export function answered(response: Readonly<Record<string, JsonValue>>): Promise<HubToolResult> {
  return Promise.resolve({ response, line: '', pictures: [] });
}

class Listening {
  open = 0;
  total = 0;

  counted(bus: SignalBus): Pick<SignalBus, 'subscribe'> {
    return {
      subscribe: (listener) => {
        this.open += 1;
        this.total += 1;
        const stop = bus.subscribe(listener);
        return (): void => {
          this.open -= 1;
          stop();
        };
      },
    };
  }
}

export function rig(store: Store, options: RigOptions = {}): Rig {
  const calls: Call[] = [];
  const events: EventInsert[] = [];
  const offered = ['post', 'find'];
  const bus = new SignalBus({ log: testLogger('signals') });
  let next: (call: Call) => Promise<HubToolResult> = () => answered({});
  const source: ToolSource = {
    tools: () => offered.map((name) => hubTool(name, options.schema ?? SINGLE_INPUT)),
    call: (tool, args, caller) => {
      const call = { tool: tool.name, args, caller };
      calls.push(call);
      return next(call);
    },
    validate: (): null => null,
    changes: (): (() => void) => () => undefined,
  };
  const listening = new Listening();
  const perform = performer(
    pluginNodeEffects({
      store,
      events: {
        record: (event) => {
          events.push(event);
          return undefined;
        },
      },
      clock: { now: () => new Date(AT) },
      signals: listening.counted(bus),
      tools: () => new ToolHub([source]),
    }),
  );
  const run = testRun();
  return {
    calls,
    events,
    offered,
    bus,
    run,
    listening: () => ({ open: listening.open, total: listening.total }),
    answer: (result): void => {
      next = (): Promise<HubToolResult> => result;
    },
    answerWith: (reply): void => {
      next = reply;
    },
    perform: (kind, params, mode, over): Promise<unknown> =>
      perform(request(kind, params, mode), over ?? run),
  };
}
