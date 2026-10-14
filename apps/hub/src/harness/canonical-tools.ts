import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { ApiError, DSH_SESSION_ID } from '@smarteverything/domain';
import type { HarnessTransportRequest, DshSessionEvent } from '@smarteverything/domain';
import { eventAuthority } from '../assistant/execution-authority';
import type { HarnessService } from './service';

export type CentralToolRequest = Extract<HarnessTransportRequest['request'], { operation: 'tool' }>;
const CALL = z.object({
  callId: z.string(),
  name: z.string(),
  arguments: z.string(),
  turn: z.int(),
  step: z.int(),
});
const TURN = z.object({ turn: z.int() });
const MESSAGE = z.object({ id: z.string() });
export function admitCanonicalTool(service: HarnessService, request: CentralToolRequest): void {
  const { grant, delivery, metadata } = canonicalScope(service, request);
  const event = service.store.assistantEvents.event(grant.event_id);
  const authority = eventAuthority(service.store, event);
  if (
    event.chat_id !== metadata.chat_id ||
    event.profile_id !== grant.profile_id ||
    !authority.hub_os_ban
  )
    throw new ApiError(
      'forbidden',
      'Central calls require an immutable initiating scope with permanent hub OS exclusion.',
    );
  const events = deliveryEvents(service, {
    id: grant.session_id,
    profile: grant.profile_id,
    start: delivery.start_seq,
    end: metadata.next_seq,
  });
  admitCall(events, request, grant.event_id);
}
function canonicalScope(
  service: HarnessService,
  request: CentralToolRequest,
): {
  readonly grant: ReturnType<HarnessService['storage']['grant']> & { readonly event_id: string };
  readonly delivery: { readonly start_seq: number };
  readonly metadata: { readonly chat_id: string; readonly next_seq: number };
} {
  const grant = service.storage.grant(request.claim.session_id);
  if (grant.event_id === null)
    throw new ApiError('forbidden', 'Central tools require a canonical initiating event.');
  const delivery = service.store.harnessDeliveries.find(grant.event_id);
  const metadata = service.store.dshSessions.stat(grant.session_id, grant.profile_id);
  if (delivery === undefined || metadata === undefined)
    throw new ApiError('forbidden', 'The native delivery is absent.');
  if (
    delivery.session_id !== grant.session_id ||
    delivery.state !== 'admitted' ||
    delivery.start_seq === null
  )
    throw new ApiError('forbidden', 'Central calls require a current admitted delivery.');
  if (request.call_seq < delivery.start_seq || request.call_seq < metadata.inherited_event_count)
    throw new ApiError(
      'forbidden',
      'Central calls cannot use inherited or earlier delivery events.',
    );
  return {
    grant: { ...grant, event_id: grant.event_id },
    delivery: { start_seq: delivery.start_seq },
    metadata,
  };
}
function admitCall(
  events: readonly DshSessionEvent[],
  request: CentralToolRequest,
  eventId: string,
): void {
  const native = events.find((candidate) => candidate.seq === request.call_seq);
  if (native?.type !== 'tool/call')
    throw new ApiError('forbidden', 'The central call has no canonical native tool event.');
  const call = CALL.parse(native.data);
  if (
    call.callId !== request.call_id ||
    call.name !== request.name ||
    !isDeepStrictEqual(JSON.parse(call.arguments), request.arguments)
  )
    throw new ApiError(
      'forbidden',
      'The central call differs from its canonical native arguments or identity.',
    );
  admitTurn(events, native, call, eventId);
}
function deliveryEvents(
  service: HarnessService,
  input: {
    readonly id: string;
    readonly profile: string;
    readonly start: number;
    readonly end: number;
  },
): DshSessionEvent[] {
  const { id, profile, start, end } = input;
  const events: DshSessionEvent[] = [];
  for (let offset = start; offset < end; offset += 10_000)
    events.push(
      ...service.store.dshSessions.read(
        { session_id: DSH_SESSION_ID.parse(id), offset, limit: Math.min(10_000, end - offset) },
        profile,
      ).events,
    );
  return events;
}
function admitTurn(
  events: readonly DshSessionEvent[],
  native: DshSessionEvent,
  call: z.infer<typeof CALL>,
  deliveryId: string,
): void {
  const prior = events.filter((event) => event.seq < native.seq);
  const user = prior.find(
    (event) => event.type === 'user/message' && MESSAGE.parse(event.data).id === deliveryId,
  );
  const turn = prior.findLast((event) => event.type === 'turn/start');
  const settled = events.some(
    (event) =>
      event.seq > native.seq &&
      (event.type === 'turn/end' ||
        (event.type === 'tool/result' &&
          z.array(z.int()).parse(event.sourceEventSeqs).includes(native.seq))),
  );
  if (
    user === undefined ||
    turn === undefined ||
    TURN.parse(turn.data).turn !== call.turn ||
    settled
  )
    throw new ApiError(
      'forbidden',
      'This canonical native call is inherited, settled or outside its initiating turn.',
    );
}
