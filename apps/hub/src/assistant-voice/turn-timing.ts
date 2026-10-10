export type Measure = (event: string, fields: Readonly<Record<string, number | string>>) => void;

export class TurnTimer {
  private lastHeardAt: number | null = null;
  private firstHeardAt: number | null = null;
  private toolMs = 0;
  private tools = 0;

  constructor(
    private readonly now: () => number,
    private readonly measure: Measure,
    private readonly sinceVoice: () => number | null,
  ) {}

  heard(): void {
    this.lastHeardAt = this.now();
    this.firstHeardAt ??= this.lastHeardAt;
  }

  tool(name: string, startedAt: number): void {
    const ms = this.now() - startedAt;
    this.toolMs += ms;
    this.tools += 1;
    this.measure('voice.tool_timed', { tool: name, ms });
  }

  spoke(): void {
    const fields: Record<string, number> = { toolMs: this.toolMs, tools: this.tools };
    if (this.lastHeardAt !== null && this.firstHeardAt !== null) {
      fields['sinceTranscriptMs'] = this.now() - this.lastHeardAt;
      fields['transcriptSpanMs'] = this.lastHeardAt - this.firstHeardAt;
    }
    const voice = this.sinceVoice();
    if (voice !== null) {
      fields['sinceVoiceMs'] = voice;
    }
    this.measure('voice.turn_timed', fields);
    this.lastHeardAt = null;
    this.firstHeardAt = null;
    this.toolMs = 0;
    this.tools = 0;
  }
}
