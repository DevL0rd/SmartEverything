import { nativeEvents } from '../../src/persistence/validation';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { DSH_SESSION_METADATA, DSH_SESSION_ID } from '@smarteverything/domain';
import type {
  DshWriterClaim,
  DshSessionMetadata,
  DshSessionOpened,
  HarnessCallRequest,
} from '@smarteverything/domain';
import { HARNESS_BOOT } from '../../src/process/boot';
import { HarnessHub, type HarnessCallPort } from '../../src/process/http';
import { HubSessionLog } from '../../src/process/persistence';
import type { MemoryPersistence, StoredSession } from './memory-persistence';

export class RestartedHub implements HarnessCallPort {
  readonly renewed: string[] = [];
  readonly claims = new Map<string, DshWriterClaim>();
  readonly persistence: HubSessionLog;
  readonly parent: DshWriterClaim;
  readonly target = { kind: 'device', device_id: randomUUID() } as const;
  readonly runtime = randomUUID();
  readonly generation = randomUUID();
  private readonly profile = randomUUID();
  private readonly chats = new Map<string, string>();
  failResume = false;

  constructor(
    readonly source: MemoryPersistence,
    parentId: string,
  ) {
    this.parent = {
      session_id: DSH_SESSION_ID.parse(parentId),
      target: this.target,
      epoch: 2,
      runtime_instance: this.runtime,
      connection_generation: this.generation,
    };
    for (const [id] of source.sessions) {
      this.chats.set(id, randomUUID());
      this.claims.set(id, {
        ...this.parent,
        session_id: DSH_SESSION_ID.parse(id),
        epoch: 1,
        runtime_instance: randomUUID(),
        connection_generation: randomUUID(),
      });
    }
    this.claims.set(parentId, this.parent);
    const boot = HARNESS_BOOT.parse({
      type: 'harness_boot',
      protocol: 1,
      device_id: this.target.device_id,
      generation: this.generation,
      runtime_instance: this.runtime,
      name: 'Test machine',
      hub_url: 'http://hub.test',
      token: 'test',
      home_directory: '/home/test',
      state_directory: '/home/test/state',
      platform: 'linux',
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    });
    this.persistence = new HubSessionLog(new HarnessHub(boot, this));
    this.persistence.bind(this.parent);
  }

  private stored(id: string): StoredSession {
    const stored = this.source.sessions.get(id);
    if (stored === undefined) throw new Error('Unknown session.');
    return stored;
  }
  private metadata(id: string): DshSessionMetadata {
    const stored = this.stored(id);
    return DSH_SESSION_METADATA.parse({
      chat_id: this.chats.get(id),
      profile_id: this.profile,
      header: stored.header,
      inherited_event_count: stored.inherited,
      next_seq: stored.events.length,
      durable_seq: stored.events.length - 1,
    });
  }
  private verify(claim: DshWriterClaim): void {
    if (!isDeepStrictEqual(claim, this.claims.get(claim.session_id)))
      throw new Error('Stale writer.');
  }
  call(request: HarnessCallRequest): Promise<unknown> {
    return Promise.resolve().then(() => this.dispatch(request));
  }
  private dispatch(request: HarnessCallRequest): unknown {
    if (request.operation === 'stat') return this.metadata(request.session_id);
    if (request.operation === 'resume_child') return this.resume(request);
    if (request.operation === 'read') {
      const { session_id: id, offset = 0, limit = 10_000 } = request.input;
      return {
        metadata: this.metadata(id),
        events: this.stored(id).events.slice(offset, offset + limit),
        next_offset: offset + limit < this.stored(id).events.length ? offset + limit : null,
      };
    }
    if (request.operation === 'verify') {
      this.verify(request.claim);
      return request.claim;
    }
    if (request.operation === 'append' || request.operation === 'flush') {
      return this.write(request);
    }
    throw new Error(`Unexpected ${request.operation}.`);
  }
  private write(request: Extract<HarnessCallRequest, { operation: 'append' | 'flush' }>): unknown {
    this.verify(request.input.claim);
    const id = request.input.claim.session_id;
    if (request.operation === 'append')
      this.stored(id).events.push(...nativeEvents(this.stored(id).header, request.input.events));
    return this.metadata(id);
  }
  private resume(
    request: Extract<HarnessCallRequest, { operation: 'resume_child' }>,
  ): DshSessionOpened {
    this.verify(request.parent_claim);
    const id = request.session_id;
    if (this.failResume) throw new Error('Execution host unavailable.');
    if (
      DSH_SESSION_ID.parse(this.stored(id).header.parentSession) !== request.parent_claim.session_id
    )
      throw new Error('Wrong direct parent.');
    const old = this.claims.get(id);
    if (old === undefined) throw new Error('No child claim.');
    const claim =
      old.runtime_instance === this.runtime
        ? old
        : {
            ...old,
            epoch: old.epoch + 1,
            runtime_instance: this.runtime,
            connection_generation: this.generation,
          };
    this.claims.set(id, claim);
    this.renewed.push(id);
    return { claim, metadata: this.metadata(id) };
  }
}
