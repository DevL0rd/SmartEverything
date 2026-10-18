import { isDeepStrictEqual } from 'node:util';
import {
  COMPUTER_NATIVE_MCP_POLICY,
  type ComputerNativeMcpPolicy,
  type ComputerRuntimeTarget,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const ROW = z.strictObject({ policy: SQL_JSON.pipe(COMPUTER_NATIVE_MCP_POLICY) });
const CONTROL = z.object({
  control: z.object({
    enabled: z.boolean(),
    mcp_areas: COMPUTER_NATIVE_MCP_POLICY.shape.areas.default(null),
  }),
});

export class ComputerNativeMcpPolicyRepository {
  constructor(private readonly context: StoreContext) {}

  read(target: ComputerRuntimeTarget): ComputerNativeMcpPolicy {
    const row = this.context.sql.get(
      ROW,
      'select policy from computer_native_mcp_policy where device_id=$device and runtime=$runtime',
      { device: target.device_id, runtime: target.runtime },
    );
    return row === undefined ? this.legacy(target) : row.policy;
  }

  save(target: ComputerRuntimeTarget, value: ComputerNativeMcpPolicy): ComputerNativeMcpPolicy {
    const policy = COMPUTER_NATIVE_MCP_POLICY.parse(value);
    this.context.write(() => {
      this.context.sql.run(
        'save native runtime MCP policy',
        'insert into computer_native_mcp_policy(device_id,runtime,policy,updated_at) values($device,$runtime,$policy,$now) on conflict(device_id,runtime) do update set policy=excluded.policy,updated_at=excluded.updated_at',
        {
          device: target.device_id,
          runtime: target.runtime,
          policy: jsonText(policy),
          now: this.context.now(),
        },
      );
      if (!policy.enabled || policy.areas?.length === 0) this.revoke(target);
    });
    return policy;
  }

  bindLocal(deviceId: string, tokenHash: string): void {
    this.context.sql.run(
      'retain proven local CLI MCP grant identity',
      "insert or ignore into computer_local_mcp_grants(device_id,runtime,token_hash) select $device,'claude',token_hash from mcp_tokens where token_hash=$hash and local_only=1",
      { device: deviceId, hash: tokenHash },
    );
  }

  localGrant(tokenHash: string): ComputerRuntimeTarget | undefined {
    return this.context.sql.get(
      z.strictObject({ device_id: z.uuid(), runtime: z.enum(['claude', 'codex']) }),
      'select g.device_id,g.runtime from computer_local_mcp_grants g join mcp_tokens t on t.token_hash=g.token_hash where g.token_hash=$hash and t.revoked_at is null',
      { hash: tokenHash },
    );
  }

  syncLegacy(target: ComputerRuntimeTarget, control: z.infer<typeof CONTROL>['control']): void {
    const previous = this.legacy(target);
    const next = { enabled: control.enabled, areas: control.mcp_areas };
    if (!isDeepStrictEqual(previous, next)) this.save(target, next);
  }

  denyLegacy(
    target: ComputerRuntimeTarget,
    control:
      | {
          readonly enabled?: boolean | undefined;
          readonly mcp_areas?: ComputerNativeMcpPolicy['areas'] | undefined;
        }
      | undefined,
  ): void {
    if (control?.enabled !== false && control?.mcp_areas?.length !== 0) return;
    const policy = this.read(target);
    this.save(target, {
      enabled: control.enabled === false ? false : policy.enabled,
      areas: control.mcp_areas?.length === 0 ? [] : policy.areas,
    });
  }

  private legacy(target: ComputerRuntimeTarget): ComputerNativeMcpPolicy {
    const row = this.context.sql.get(
      z.strictObject({ settings: SQL_JSON.pipe(CONTROL) }),
      'select settings from computer_ai where device_id=$device and runtime=$runtime',
      { device: target.device_id, runtime: target.runtime },
    );
    return row === undefined
      ? { enabled: false, areas: null }
      : { enabled: row.settings.control.enabled, areas: row.settings.control.mcp_areas };
  }

  private revoke(target: ComputerRuntimeTarget): void {
    this.context.sql.run(
      'revoke disabled runtime MCP token',
      'delete from computer_runtime_grants where device_id=$device and runtime=$runtime',
      { device: target.device_id, runtime: target.runtime },
    );
  }
}
