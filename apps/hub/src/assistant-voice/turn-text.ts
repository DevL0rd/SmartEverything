const KEPT_FRAGMENTS = 200;
const FAREWELL =
  /^(?:ok(?:ay)?[,.!]?\s*)?(?:good ?bye|bye(?: for now)?|see you(?: later| soon)?|talk (?:to you )?(?:later|soon)|take care|catch you later|later)\b[^?]{0,40}$/i;

interface Fragment {
  readonly at: number;
  readonly text: string;
}

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
  private fragments: Fragment[] = [];

  heard(fragment: string, at: number): string {
    this.heardNow += fragment;
    this.fragments = [...this.fragments, { at, text: fragment }].slice(-KEPT_FRAGMENTS);
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

  heardSince(at: number): string {
    return clean(
      this.fragments
        .filter((fragment) => fragment.at >= at)
        .map((fragment) => fragment.text)
        .join(''),
    );
  }

  recentHeard(): string | null {
    const text = clean(this.heardNow) || this.lastHeard;
    return text === '' ? null : text;
  }
}
