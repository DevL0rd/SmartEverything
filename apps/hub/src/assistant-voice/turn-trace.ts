import { TALK_FRAME_MS } from '@smarteverything/domain';
import type { Measure, MeasureFields } from './turn-timing';
import type { CallEnding } from '@smarteverything/domain';
import { endCauseOf, endedByOf } from './call-end';
import { Turn, type PendingKind } from './turn-trace-turn';

export const MODEL_SILENT_MS = 8000;
export const AUDIO_GAP_MS = 1000;
const LONG_AUDIO_GAP_MS = 3000;
const PROVIDER = 'gemini';

export type HandedMode = 'session' | 'late_text' | 'no_session' | 'call_closed';
export type OutputKind = 'audio' | 'text' | 'tool';

interface OpenTool {
  readonly name: string;
  readonly receivedAt: number;
  startedAt: number | null;
}

interface Slowest {
  readonly totalMs: number;
  readonly fields: MeasureFields;
}

export interface MicStalls {
  readonly stallCount: number;
  readonly longestMs: number;
}

export class TurnTrace {
  private readonly startedAt: number;
  private turn: Turn | null = null;
  private serial = 0;
  private turns = 0;
  private toolsTotal = 0;
  private slowest: Slowest | null = null;
  private readonly open = new Map<string, OpenTool>();
  private timer: NodeJS.Timeout | null = null;
  private endedAt: number | null = null;
  private playUntil = 0;
  private audioFrames = 0;
  private audioGaps = 0;
  private silences = 0;
  private model = '';

  constructor(
    private readonly now: () => number,
    private readonly measure: Measure,
    private readonly warm: string,
  ) {
    this.startedAt = now();
  }

  opened(model: string): void {
    this.model = model;
  }

  get pendingTools(): number {
    return this.open.size;
  }

  speechEnded(): void {
    const turn = this.turn ?? this.begin('speech');
    turn.spoke(this.now());
    this.requested(turn, 'speech_end');
  }

  note(respond: boolean): void {
    if (respond) {
      this.requested(this.turn ?? this.begin('note'), 'note');
    }
  }

  heard(chars: number): void {
    const at = this.now();
    const turn = this.turn;
    turn?.heard(at);
    this.measure(
      'voice.transcript_received',
      {
        ...this.fields(turn),
        chars,
        joinedTurn: turn !== null,
        pendingMs: turn?.pendingMs(at) ?? 0,
        queueDepth: this.open.size,
        turnAgeMs: turn === null ? 0 : at - turn.startedAt,
      },
      'debug',
    );
  }

  output(kind: OutputKind): void {
    this.late(`output_${kind}`);
    const turn = this.turn ?? this.begin('model');
    const at = this.now();
    const seen = turn.output(at);
    if (seen.first) {
      this.phase(turn, `first_output_${kind}`, at);
    }
    if (seen.afterResult) {
      this.phase(turn, 'first_output_after_result', at);
    }
    this.disarm();
  }

  audioSent(frames: number): void {
    const at = this.now();
    const turn = this.turn;
    if (this.playUntil > 0 && at - this.playUntil > AUDIO_GAP_MS) {
      this.audioGaps += 1;
      this.measure(
        'voice.audio_gap',
        { ...this.fields(turn), gapMs: Math.round(at - this.playUntil), count: this.audioGaps },
        at - this.playUntil > LONG_AUDIO_GAP_MS ? 'warn' : 'debug',
      );
    }
    this.playUntil = Math.max(at, this.playUntil) + frames * TALK_FRAME_MS;
    this.audioFrames += frames;
    if (turn?.audio(at) === true) {
      this.phase(turn, 'first_audio_sent', at);
    }
  }

  toolReceived(id: string, name: string, assistantSpeaking: boolean): void {
    const at = this.now();
    const turn = this.turn ?? this.begin('model');
    turn.toolReceived();
    this.toolsTotal += 1;
    this.open.set(id, { name, receivedAt: at, startedAt: null });
    this.measure('voice.tool_received', {
      ...this.fields(turn),
      tool: name,
      toolCallId: id,
      concurrent: this.open.size,
      assistantSpeaking,
      sinceTurnMs: at - turn.startedAt,
    });
  }

  toolStarted(id: string): void {
    const tool = this.open.get(id);
    if (tool !== undefined) {
      tool.startedAt = this.now();
      this.measure(
        'voice.tool_started',
        {
          ...this.fields(this.turn),
          tool: tool.name,
          toolCallId: id,
          queuedMs: tool.startedAt - tool.receivedAt,
        },
        'debug',
      );
    }
  }

  toolFinished(id: string, failed: boolean): void {
    const tool = this.open.get(id);
    if (tool !== undefined) {
      const ranMs = this.now() - (tool.startedAt ?? tool.receivedAt);
      this.turn?.toolRan(ranMs);
      this.measure(
        'voice.tool_finished',
        { ...this.fields(this.turn), tool: tool.name, toolCallId: id, ranMs, failed },
        'debug',
      );
    }
  }

  resultHanded(id: string, mode: HandedMode): void {
    const at = this.now();
    const tool = this.open.get(id);
    this.open.delete(id);
    const turn = this.turn;
    this.measure(
      'voice.tool_result_handed',
      {
        ...this.fields(turn),
        tool: tool?.name ?? 'unknown',
        toolCallId: id,
        mode,
        totalMs: tool === undefined ? 0 : at - tool.receivedAt,
        concurrent: this.open.size,
      },
      mode === 'session' ? 'info' : 'warn',
    );
    if (turn !== null && mode !== 'call_closed') {
      turn.resulted(at);
      if (this.open.size === 0) {
        this.arm(turn, 'tool_result');
      }
    }
  }

  completed(): void {
    this.late('turn_complete');
    const turn = this.turn;
    if (turn === null) {
      return;
    }
    const at = this.now();
    this.phase(turn, 'turn_complete', at);
    const offsets = this.offsets(turn, at);
    this.measure('voice.turn_timeline', {
      ...this.fields(turn),
      kind: turn.kind,
      transcripts: turn.transcripts,
      tools: turn.tools,
      ...offsets,
    });
    this.turns += 1;
    const total = at - turn.startedAt;
    if (this.slowest === null || total > this.slowest.totalMs) {
      this.slowest = { totalMs: total, fields: this.slowestOf(turn, total) };
    }
    this.finish();
  }

  cut(): void {
    const turn = this.turn;
    if (turn !== null) {
      this.measure(
        'voice.turn_cut',
        {
          ...this.fields(turn),
          ...this.offsets(turn, this.now()),
          toolsOpen: this.open.size,
          unanswered: turn.firstOutputAt === null,
        },
        'debug',
      );
    }
    this.finish();
  }

  callEnded(reason: CallEnding, given: string | undefined, mic: MicStalls): void {
    const cause = given ?? endCauseOf(reason);
    const at = this.now();
    this.endedAt = at;
    const open = this.turn;
    this.disarm();
    this.measure('voice.call_summary', {
      ...this.fields(null),
      ...(this.slowest?.fields ?? { slowestTurn: 'none', slowestTurnMs: 0 }),
      durationMs: at - this.startedAt,
      turns: this.turns,
      tools: this.toolsTotal,
      toolsOpenAtEnd: this.open.size,
      turnOpenAtEnd: open !== null,
      openTurnAgeMs: open === null ? 0 : at - open.startedAt,
      modelSilences: this.silences,
      audioFramesSent: this.audioFrames,
      audioGaps: this.audioGaps,
      micStalls: mic.stallCount,
      micLongestStallMs: mic.longestMs,
      endReason: reason,
      cause,
      endedBy: endedByOf(cause),
    });
  }

  private slowestOf(turn: Turn, total: number): MeasureFields {
    const offsets = this.offsets(turn, total + turn.startedAt);
    return {
      slowestTurn: turn.id,
      slowestTurnMs: total,
      slowestFirstOutputMs: offsets['firstOutputMs'] ?? -1,
      slowestFirstAudioMs: offsets['firstAudioMs'] ?? -1,
      slowestToolMs: turn.slowestToolMs,
    };
  }

  private begin(kind: Turn['kind']): Turn {
    this.serial += 1;
    const turn = new Turn(`t${String(this.serial)}`, this.now(), kind);
    this.turn = turn;
    return turn;
  }

  private requested(turn: Turn, why: string): void {
    const at = this.now();
    turn.requested(at);
    this.phase(turn, `request_sent_${why}`, at);
    this.arm(turn, 'request');
  }

  private finish(): void {
    this.turn = null;
    this.playUntil = 0;
    this.disarm();
  }

  private arm(turn: Turn, kind: PendingKind): void {
    this.disarm();
    turn.wait(this.now(), kind);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.silent(turn);
    }, MODEL_SILENT_MS);
    this.timer.unref();
  }

  private disarm(): void {
    clearTimeout(this.timer ?? undefined);
    this.timer = null;
  }

  private silent(turn: Turn): void {
    const pending = turn.pending;
    if (this.turn !== turn || pending === null || turn.warned) {
      return;
    }
    turn.warn();
    this.silences += 1;
    const at = this.now();
    this.measure(
      'voice.model_silent',
      {
        ...this.fields(turn),
        silentMs: at - pending.since,
        since: pending.kind,
        toolsOpen: this.open.size,
        tools: turn.tools,
        turnAgeMs: at - turn.startedAt,
        lastResultAgeMs: turn.lastResultAt === null ? -1 : at - turn.lastResultAt,
        transcripts: turn.transcripts,
      },
      'warn',
    );
  }

  private late(event: string): void {
    if (this.endedAt !== null) {
      this.measure(
        'voice.turn_after_end',
        { ...this.fields(this.turn), event, afterEndMs: this.now() - this.endedAt },
        'warn',
      );
    }
  }

  private phase(turn: Turn, phase: string, at: number): void {
    this.measure(
      'voice.turn_phase',
      { ...this.fields(turn), phase, sinceTurnMs: at - turn.startedAt },
      'debug',
    );
  }

  private offsets(turn: Turn, at: number): Record<string, number> {
    const fields: Record<string, number> = { totalMs: at - turn.startedAt };
    const since = (name: string, value: number | null): void => {
      if (value !== null) {
        fields[name] = value - turn.startedAt;
      }
    };
    since('speechEndMs', turn.speechEndAt);
    since('transcriptMs', turn.transcriptAt);
    since('requestMs', turn.requestAt);
    since('firstOutputMs', turn.firstOutputAt);
    since('lastResultMs', turn.lastResultAt);
    since('firstOutputAfterResultMs', turn.firstOutputAfterResultAt);
    since('firstAudioMs', turn.firstAudioAt);
    fields['slowestToolMs'] = turn.slowestToolMs;
    return fields;
  }

  private fields(turn: Turn | null): MeasureFields {
    return { turnId: turn?.id ?? 'none', provider: PROVIDER, model: this.model, warm: this.warm };
  }
}
