import {
  ApiError,
  SPEECH_TRIGGER,
  type JsonValue,
  type SpeechTrigger,
  type TriggerNode,
} from '@smarteverything/domain';
import type { Cancel } from '../../clock';
import type { CommittedSpeech, SpeechOccurrence } from '../../transcripts/speech';
import { speechIsBot, speechText } from '../../transcripts/speech';
import { speechPhraseMatches } from '../../transcripts/speech-phrase';
import type { TriggerFire } from './payload';
import type { Compiled } from './schedules';

export interface SpeechGrantRecord<P> {
  readonly revision: string;
  readonly principal: P;
  readonly watermark: number;
}

export interface SpeechPorts<P, C> {
  readonly write: <T>(work: () => T) => T;
  readonly grant: (automationId: string) => SpeechGrantRecord<P> | undefined;
  readonly saveGrant: (automationId: string, revision: string, principal: P) => void;
  readonly removeGrant: (automationId: string) => void;
  readonly automation: (automationId: string) => {
    readonly enabled: boolean;
    readonly revision: number;
  };
  readonly principalOf: (caller: C) => P;
  readonly sameInitiator: (left: P, right: P) => boolean;
  readonly admitSources: (principal: P, triggers: readonly SpeechTrigger[]) => P;
  readonly validateSource: (
    principal: P,
    source: SpeechTrigger['source'],
    speech?: CommittedSpeech,
  ) => void;
  readonly subscribe: (listener: (speech: CommittedSpeech) => void) => Cancel;
  readonly failed: (cause: unknown) => void;
  readonly now: () => Date;
}

export interface SpeechEntry {
  readonly triggerId: string;
  readonly key: string;
  readonly trigger: SpeechTrigger;
}

export interface SpeechFire {
  readonly fire: TriggerFire;
  readonly validate: () => void;
  readonly occurrence: SpeechOccurrence;
}

export function speechEntries(nodes: readonly TriggerNode[]): Compiled<readonly SpeechEntry[]> {
  const entries: SpeechEntry[] = [];
  for (const node of nodes.filter(
    (entry) => entry.kind === 'trigger.speech' && entry.enabled !== false,
  )) {
    const ports: Record<string, JsonValue> = {};
    for (const [name, port] of Object.entries(node.ports)) {
      if (!('lit' in port))
        return { ok: false, error: `${name} must be a fixed value on a speech trigger` };
      ports[name] = port.lit;
    }
    const parsed = SPEECH_TRIGGER.safeParse({ type: 'speech', ...ports });
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') };
    entries.push({ triggerId: node.id, key: node.key, trigger: parsed.data });
  }
  return { ok: true, value: entries };
}

export function authorSpeech<P, C, R>(
  ports: SpeechPorts<P, C>,
  caller: C,
  input: {
    readonly automationId?: string | undefined;
    readonly triggers: readonly SpeechTrigger[];
    readonly save: () => R;
    readonly saved: (row: R) => { readonly id: string; readonly revision: number };
  },
): R {
  return ports.write(() => {
    const { automationId, triggers } = input;
    const prior = automationId === undefined ? undefined : ports.grant(automationId);
    if (triggers.length === 0 && prior === undefined) return input.save();
    const principal = ports.principalOf(caller);
    if (prior !== undefined && !ports.sameInitiator(prior.principal, principal))
      throw new ApiError(
        'forbidden',
        'Only the initiating profile may change or reauthorize this speech automation.',
      );
    const admitted = ports.admitSources(principal, triggers);
    const row = input.save();
    const { id, revision } = input.saved(row);
    if (triggers.length === 0) ports.removeGrant(id);
    else ports.saveGrant(id, String(revision), admitted);
    return row;
  });
}

function validatorFor<P, C>(
  ports: SpeechPorts<P, C>,
  automationId: string,
  grant: SpeechGrantRecord<P>,
  trigger: SpeechTrigger,
): (speech?: CommittedSpeech) => void {
  return (speech) => {
    const record = ports.automation(automationId);
    const current = ports.grant(automationId);
    if (
      !record.enabled ||
      current?.revision !== grant.revision ||
      String(record.revision) !== grant.revision ||
      !ports.sameInitiator(current.principal, grant.principal)
    )
      throw new ApiError('forbidden', 'The saved speech trigger authorization changed.');
    ports.validateSource(grant.principal, trigger.source, speech);
  };
}

function speechPayload(
  entry: SpeechEntry,
  speech: CommittedSpeech,
  at: string,
): TriggerFire['payload'] {
  const source: Record<string, string> =
    speech.kind === 'transcript'
      ? { kind: speech.session.source, id: speech.session.source_id }
      : { kind: 'attachment', id: speech.attachmentId };
  return {
    phrase: entry.trigger.phrase,
    text: speechText(speech),
    source,
    ...(speech.kind === 'attachment' ? { speaker: speech.profileId } : {}),
    at,
  };
}

export function armSpeech<P, C>(
  ports: SpeechPorts<P, C>,
  automationId: string,
  entries: readonly SpeechEntry[],
  deliver: (speech: SpeechFire) => void,
): Cancel {
  const grant = ports.grant(automationId);
  if (grant === undefined) return (): void => undefined;
  const cancels = entries.flatMap((entry) => {
    const validate = validatorFor(ports, automationId, grant, entry.trigger);
    try {
      validate();
    } catch (cause) {
      ports.failed(cause);
      return [];
    }
    return [
      ports.subscribe((speech) => {
        if (speech.commitId <= grant.watermark) return;
        if (!entry.trigger.includeBots && speechIsBot(speech)) return;
        try {
          validate(speech);
        } catch (cause) {
          ports.failed(cause);
          return;
        }
        if (!speechPhraseMatches(entry.trigger, speechText(speech))) return;
        const at = ports.now().toISOString();
        deliver({
          fire: {
            automationId,
            triggerId: entry.triggerId,
            key: entry.key,
            kind: 'trigger.speech',
            at,
            payload: speechPayload(entry, speech, at),
          },
          validate: (): void => {
            validate(speech);
          },
          occurrence: { automationId, revision: grant.revision, commitId: speech.commitId },
        });
      }),
    ];
  });
  return (): void => {
    for (const cancel of cancels) cancel();
  };
}
