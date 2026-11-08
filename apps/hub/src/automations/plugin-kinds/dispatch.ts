import { jsonEquals, type JsonValue } from '@smarteverything/domain';
import { background, failureLine } from '@smarteverything/logging';
import { z } from 'zod';
import type { EffectFailureResult } from '../effect-failure';
import type { BoundArgs } from './args';

export const BATCH_RESULTS = 'items';

export type Reply =
  { readonly ok: true; readonly response: Readonly<Record<string, unknown>> } | EffectFailureResult;

export interface Submission {
  readonly identity: string;
  readonly tool: string;
  readonly args: BoundArgs;
  readonly batchArg: string | undefined;
  readonly invoke: (args: BoundArgs) => Promise<Reply>;
}

interface Member {
  readonly element: JsonValue;
  readonly resolve: (reply: Reply) => void;
}

interface Group {
  readonly identity: string;
  readonly tool: string;
  readonly batchArg: string;
  readonly rest: BoundArgs;
  readonly invoke: Submission['invoke'];
  readonly members: Member[];
}

const ITEM = z.record(z.string(), z.unknown());

function failed(message: string, code: string): EffectFailureResult {
  return { ok: false, class: 'Failed', message, code };
}

function withoutArg(args: BoundArgs, name: string): BoundArgs {
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== name));
}

function sameGroup(group: Group, call: Submission, batchArg: string, rest: BoundArgs): boolean {
  return (
    group.identity === call.identity &&
    group.tool === call.tool &&
    group.batchArg === batchArg &&
    jsonEquals(group.rest, rest)
  );
}

function everyone(count: number, reply: Reply): readonly Reply[] {
  return Array.from({ length: count }, () => reply);
}

export function splitReply(reply: Reply, count: number): readonly Reply[] {
  if (!reply.ok) return everyone(count, reply);
  if (typeof reply.response['error'] === 'string') return everyone(count, reply);
  const items = reply.response[BATCH_RESULTS];
  if (!Array.isArray(items) || items.length !== count) {
    return everyone(
      count,
      failed(
        `The plugin answered a batch of ${String(count)} calls without ${String(count)} ${BATCH_RESULTS}.`,
        'batch_mismatch',
      ),
    );
  }
  return items.map((item): Reply => {
    const parsed = ITEM.safeParse(item);
    return parsed.success
      ? { ok: true, response: parsed.data }
      : failed('A batched answer is not an object.', 'batch_mismatch');
  });
}

export class PluginDispatcher {
  private groups: Group[] = [];
  private scheduled = false;

  submit(call: Submission): Promise<Reply> {
    const { batchArg } = call;
    if (batchArg === undefined || !Object.hasOwn(call.args, batchArg)) {
      return call.invoke(call.args);
    }
    const element = call.args[batchArg];
    if (element === undefined) return call.invoke(call.args);
    const rest = withoutArg(call.args, batchArg);
    return new Promise((resolve) => {
      const member = { element, resolve };
      const group = this.groups.find((open) => sameGroup(open, call, batchArg, rest));
      if (group === undefined) {
        this.groups.push({ ...call, batchArg, rest, members: [member] });
        this.schedule();
      } else {
        group.members.push(member);
      }
    });
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      const groups = this.groups;
      this.groups = [];
      for (const group of groups) {
        background(this.send(group), 'plugin_dispatch.failed', {
          tool: group.tool,
          calls: group.members.length,
        });
      }
    });
  }

  private async send(group: Group): Promise<void> {
    const { members } = group;
    const args = { ...group.rest, [group.batchArg]: members.map((member) => member.element) };
    const replies = await group.invoke(args).then(
      (reply) => splitReply(reply, members.length),
      (cause: unknown) => everyone(members.length, failed(failureLine(cause), 'dispatch_failed')),
    );
    members.forEach((member, index) => {
      member.resolve(replies[index] ?? failed('The batched answer is missing.', 'batch_mismatch'));
    });
  }
}

export class PluginDispatchers {
  private readonly open = new Map<string, PluginDispatcher>();

  of(pluginId: string): PluginDispatcher {
    const existing = this.open.get(pluginId);
    if (existing !== undefined) return existing;
    const created = new PluginDispatcher();
    this.open.set(pluginId, created);
    return created;
  }
}
