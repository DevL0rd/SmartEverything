import type { RecordedTurn } from './call-record';

const FAREWELL =
  /^(?:ok(?:ay)?[,.!]?\s*)?(?:good ?bye|bye(?: for now)?|see you(?: later| soon)?|talk (?:to you )?(?:later|soon)|take care|catch you later|later)\b[^?]{0,40}$/i;

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function isFarewell(said: string): boolean {
  return FAREWELL.test(said);
}

export class TurnText {
  private heardNow = '';
  private saidNow = '';
  private lastHeard = '';

  heard(fragment: string): string {
    this.heardNow += fragment;
    return clean(this.heardNow);
  }

  said(fragment: string): string {
    this.saidNow += fragment;
    return clean(this.saidNow);
  }

  takeHeard(): string {
    const text = clean(this.heardNow);
    this.heardNow = '';
    if (text !== '') {
      this.lastHeard = text;
    }
    return text;
  }

  takeSaid(): string {
    const text = clean(this.saidNow);
    this.saidNow = '';
    return text;
  }

  recentHeard(): string | null {
    const text = clean(this.heardNow) || this.lastHeard;
    return text === '' ? null : text;
  }
}

export class TurnRecorder {
  constructor(
    private readonly text: TurnText,
    private readonly record: (turn: RecordedTurn) => void,
  ) {}

  heard(): void {
    const heard = this.text.takeHeard();
    if (heard !== '') {
      this.record({ who: 'person', text: heard, ok: true, detail: null });
    }
  }

  said(): string {
    const said = this.text.takeSaid();
    if (said !== '') {
      this.record({ who: 'assistant', text: said, ok: true, detail: null });
    }
    return said;
  }
}
