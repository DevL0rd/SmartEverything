import {
  COMPUTER_NODE_ROW,
  COMPUTER_AI_RUNTIME,
  type ComputerAiRuntime,
  type ComputerNodeRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';

const PAIRING = z.strictObject({ hub_url: z.string(), expires_at: z.string() });
const STORED = COMPUTER_NODE_ROW.extend({
  token_hash: z.string().min(1),
  window_client_id: z.string().nullable(),
});

export class ComputerNodesRepository {
  constructor(private readonly context: StoreContext) {}

  byToken(tokenHash: string): ComputerNodeRow | undefined {
    return this.context.sql.get(
      COMPUTER_NODE_ROW,
      'select device_id, machine_id, hub_url, paired_at, revoked_at from computer_nodes where token_hash = $tokenHash and revoked_at is null',
      { tokenHash },
    );
  }

  byMachine(machineId: string): z.infer<typeof STORED> | undefined {
    return this.context.sql.get(
      STORED,
      'select * from computer_nodes where machine_id = $machineId',
      { machineId },
    );
  }

  pairing(codeHash: string, hubUrl: string, createdBy: string, expiresAt: string): void {
    this.context.sql.run(
      'forget expired computer pairing codes',
      'delete from computer_node_pairings where expires_at <= $now',
      { now: this.context.now() },
    );
    this.context.sql.run(
      'create computer pairing code',
      'insert into computer_node_pairings(code_hash, hub_url, created_by, expires_at) values($codeHash, $hubUrl, $createdBy, $expiresAt)',
      { codeHash, hubUrl, createdBy, expiresAt },
    );
  }

  claim<T>(codeHash: string, bind: (hubUrl: string) => T): T | null {
    return this.context.write(() => {
      const row = this.context.sql.get(
        PAIRING,
        'select hub_url, expires_at from computer_node_pairings where code_hash = $codeHash',
        { codeHash },
      );
      if (row === undefined || row.expires_at <= this.context.now()) return null;
      this.context.sql.run(
        'consume computer pairing code',
        'delete from computer_node_pairings where code_hash = $codeHash',
        { codeHash },
      );
      return bind(row.hub_url);
    });
  }

  bind(binding: {
    readonly deviceId: string;
    readonly machineId: string;
    readonly tokenHash: string;
    readonly hubUrl: string;
    readonly windowClientId: string;
  }): void {
    this.clearRuntimeGrants(binding.deviceId);
    this.context.sql.run(
      'bind computer service identity',
      `insert into computer_nodes(device_id, machine_id, token_hash, hub_url, paired_at, revoked_at, window_client_id)
       values($deviceId, $machineId, $tokenHash, $hubUrl, $now, null, $windowClientId)
       on conflict(device_id) do update set machine_id = excluded.machine_id, token_hash = excluded.token_hash,
       hub_url = excluded.hub_url, paired_at = excluded.paired_at, revoked_at = null,
       window_client_id = excluded.window_client_id`,
      { ...binding, now: this.context.now() },
    );
  }

  byRuntimeMcpToken(
    tokenHash: string,
  ): (ComputerNodeRow & { readonly runtime: ComputerAiRuntime }) | undefined {
    return this.context.sql.get(
      COMPUTER_NODE_ROW.extend({ runtime: COMPUTER_AI_RUNTIME }),
      'select n.device_id,n.machine_id,n.hub_url,n.paired_at,n.revoked_at,g.runtime from computer_nodes n join computer_runtime_grants g on g.device_id=n.device_id where g.token_hash=$tokenHash and n.revoked_at is null',
      { tokenHash },
    );
  }
  byMcpToken(tokenHash: string): ComputerNodeRow | undefined {
    const row = this.byRuntimeMcpToken(tokenHash);
    return row?.runtime === 'claude' ? COMPUTER_NODE_ROW.strip().parse(row) : undefined;
  }
  setRuntimeMcpToken(deviceId: string, runtime: ComputerAiRuntime, tokenHash: string | null): void {
    this.context.write(() => {
      this.context.sql.run(
        'revoke runtime native MCP grant',
        'delete from computer_runtime_grants where device_id=$deviceId and runtime=$runtime',
        { deviceId, runtime },
      );
      if (tokenHash !== null)
        this.context.sql.run(
          'issue runtime native MCP grant',
          'insert into computer_runtime_grants(device_id,runtime,token_hash) select device_id,$runtime,$tokenHash from computer_nodes where device_id=$deviceId and revoked_at is null',
          { deviceId, runtime, tokenHash },
        );
    });
  }
  setMcpToken(deviceId: string, tokenHash: string | null): void {
    this.setRuntimeMcpToken(deviceId, 'claude', tokenHash);
  }

  roomOfWindow(clientId: string): string | null {
    return (
      this.context.sql.get(
        z.strictObject({ name: z.string() }),
        `select r.name from computer_nodes n
         join devices d on d.id = n.device_id
         join rooms r on r.id = d.room_id
         where n.window_client_id = $clientId and n.revoked_at is null`,
        { clientId },
      )?.name ?? null
    );
  }

  personOf(deviceId: string): string | null {
    return (
      this.context.sql.get(
        z.strictObject({ profile_id: z.string().nullable() }),
        `select c.profile_id from computer_nodes n join clients c on c.id = n.window_client_id
         where n.device_id = $deviceId and n.revoked_at is null`,
        { deviceId },
      )?.profile_id ?? null
    );
  }

  revoke(deviceId: string): string | null {
    return this.context.write(() => {
      const windowClientId =
        this.context.sql.get(
          z.strictObject({ window_client_id: z.string().nullable() }),
          'select window_client_id from computer_nodes where device_id = $deviceId',
          { deviceId },
        )?.window_client_id ?? null;
      this.clearRuntimeGrants(deviceId);
      this.context.sql.run(
        'revoke computer service identity',
        'update computer_nodes set revoked_at = $now, window_client_id = null where device_id = $deviceId',
        { deviceId, now: this.context.now() },
      );
      return windowClientId;
    });
  }
  private clearRuntimeGrants(deviceId: string): void {
    this.context.sql.run(
      'revoke all native runtime grants',
      'delete from computer_runtime_grants where device_id=$deviceId',
      { deviceId },
    );
  }
}
