import {
  BROWSER_PAGE_PROBE_RESULT,
  BrowserPageError,
  type BrowserPageOperation,
  type BrowserPageProbe,
  type BrowserPageReading,
} from './browser-page';
import { BROWSER_PAGE_SCRIPT } from './browser-page-script';
import { parseKeyCombo, type ParsedKeyCombo } from './node/computer-keys';

export interface BrowserPageTrustedInput {
  readonly click: (x: number, y: number) => Promise<void>;
  readonly insertText: (text: string) => Promise<void>;
}

export interface BrowserPageHost {
  readonly evaluate: (code: string) => Promise<unknown>;
  readonly press: (combo: ParsedKeyCombo) => Promise<void>;
  readonly trusted: BrowserPageTrustedInput | null;
}

const ENTER = parseKeyCombo('Return');
const NON_TEXT_MODIFIERS = new Set(['ctrl', 'alt', 'super']);

function typesText(combo: ParsedKeyCombo): boolean {
  return (
    Array.from(combo.key).length === 1 &&
    !combo.modifiers.some((modifier) => NON_TEXT_MODIFIERS.has(modifier))
  );
}

export class BrowserPageDriver {
  private next = 1;

  constructor(private readonly host: BrowserPageHost) {}

  async read(): Promise<BrowserPageReading> {
    const result = await this.probe({ kind: 'snapshot' });
    if (result.reading === undefined) {
      throw new BrowserPageError('The page answered without a reading.');
    }
    this.next = result.reading.end;
    return result.reading;
  }

  async perform(operation: Exclude<BrowserPageOperation, { kind: 'snapshot' }>): Promise<void> {
    switch (operation.kind) {
      case 'click':
        return this.click(operation.ref);
      case 'type':
        return this.type(operation.ref, operation.text, operation.submit);
      case 'keys':
        return this.keys(operation.keys);
      case 'scroll':
        await this.probe(operation);
        return;
    }
  }

  private async click(ref: string): Promise<void> {
    const { trusted } = this.host;
    if (trusted === null) {
      await this.probe({ kind: 'click', ref });
      return;
    }
    const { x, y } = await this.probe({ kind: 'locate', ref });
    await trusted.click(this.coordinate(x), this.coordinate(y));
  }

  private async type(ref: string, text: string, submit: boolean): Promise<void> {
    const { trusted } = this.host;
    if (trusted === null) {
      await this.probe({ kind: 'type', ref, text, submit });
      return;
    }
    await this.probe({ kind: 'focus', ref });
    await trusted.insertText(text);
    if (submit) await this.host.press(ENTER);
  }

  private async keys(keys: string): Promise<void> {
    const combo = parseKeyCombo(keys);
    if (typesText(combo)) await this.probe({ kind: 'guard' });
    await this.host.press(combo);
  }

  private coordinate(value: number | undefined): number {
    if (value === undefined)
      throw new BrowserPageError('The page did not say where the element is.');
    return value;
  }

  private async probe(probe: BrowserPageProbe): Promise<{
    readonly reading?: BrowserPageReading | undefined;
    readonly x?: number | undefined;
    readonly y?: number | undefined;
  }> {
    const code = `${BROWSER_PAGE_SCRIPT}(${JSON.stringify(probe)}, ${String(this.next)})`;
    const result = BROWSER_PAGE_PROBE_RESULT.parse(await this.host.evaluate(code));
    if (!result.ok) throw new BrowserPageError(result.error);
    return result;
  }
}
