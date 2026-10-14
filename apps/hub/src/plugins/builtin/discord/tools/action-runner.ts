import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ToolCaller } from '../../../../ai-tools/hub-tool';
import type { Access } from '../authority';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import type { Operation, OperationContext } from '../operations/kit';
import { project } from '../project';
import type { DiscordServices } from '../services';

const OUTPUT_LIMIT = 512_000;

const TARGET = z.looseObject({ guildId: SNOWFLAKE.optional(), channelId: SNOWFLAKE.optional() });

export interface ParsedCall {
  readonly eventId: string | undefined;
  readonly idempotencyKey: string | undefined;
  readonly args: Readonly<Record<string, unknown>>;
}

export function resultFits(value: unknown): boolean {
  return Buffer.byteLength(JSON.stringify(value)) <= OUTPUT_LIMIT;
}

export function boundedResult(value: unknown): Readonly<Record<string, unknown>> {
  if (!resultFits(value)) {
    throw new DiscordInputError('Result exceeds the output limit; request a smaller page');
  }
  return { result: value };
}

export class ActionRunner {
  constructor(private readonly services: DiscordServices) {}

  async resolved(call: ParsedCall): Promise<Readonly<Record<string, unknown>>> {
    const { userId, guildId } = z
      .looseObject({ userId: z.string().optional(), guildId: z.string().optional() })
      .parse(call.args);
    if (userId === undefined) {
      return call.args;
    }
    return { ...call.args, userId: await this.services.directory.resolve(userId, guildId) };
  }

  async run(op: Operation, call: ParsedCall, caller: ToolCaller): Promise<unknown> {
    const { services } = this;
    services.identity.assertReady();
    const args = await this.resolved(call);
    const access = await services.authority.access(caller, call.eventId, op.mode !== 'read');
    await this.authorize(op, args);
    if (op.mode === 'read') {
      return project(await op.run(args, this.contextOf(access)));
    }
    const key = call.idempotencyKey ?? randomUUID();
    const input = { operation: op.action, args, eventId: call.eventId, idempotencyKey: key };
    return services.journal.execute(key, input, async () => {
      const again = await services.authority.access(caller, call.eventId, true);
      await this.authorize(op, args);
      return project(await op.run(args, this.contextOf(again)));
    });
  }

  private contextOf(access: Access): OperationContext {
    const { services } = this;
    return {
      rest: services.rest,
      policy: services.policy,
      channels: services.channels,
      botId: services.identity.botId,
      applicationId: services.identity.applicationId,
      origin: access.origin,
    };
  }

  private async authorize(op: Operation, args: Readonly<Record<string, unknown>>): Promise<void> {
    const { policy, channels } = this.services;
    const target = TARGET.parse(args);
    if (op.target === 'guild') {
      const { guildId } = target;
      if (guildId === undefined) {
        throw new DiscordInputError(`${op.action} needs a guildId`);
      }
      policy.assertGuild(guildId);
      return;
    }
    if (target.channelId === undefined) {
      throw new DiscordInputError(`${op.action} needs a channelId`);
    }
    await channels.guildChannel(target.channelId);
  }
}
