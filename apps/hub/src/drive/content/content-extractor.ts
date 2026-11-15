import sharp from 'sharp';
import { extractText } from './extract';
import { OcrEngine } from './ocr';
import { UNLIMITED_PIXELS } from '../../media/sharp-input';
import type { ContentRequest, ContentResponse } from './content-protocol';

export class ContentExtractor {
  private engine: OcrEngine | null = null;

  async handle(request: ContentRequest): Promise<ContentResponse> {
    if (request.kind === 'document') {
      return {
        id: request.id,
        result: await extractText(request.path, request.name, request.mime),
      };
    }
    try {
      const text = await this.recognise(request);
      return {
        id: request.id,
        result: text === '' ? { state: 'empty' } : { state: 'ok', body: text },
      };
    } catch (cause) {
      return {
        id: request.id,
        result: { state: 'failed', reason: cause instanceof Error ? cause.message : String(cause) },
      };
    }
  }

  async close(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    await engine?.close();
  }

  private async recognise(
    request: Extract<ContentRequest, { readonly kind: 'image' }>,
  ): Promise<string> {
    const engine = await this.engineFor(request.languages, request.languageDirectory);
    const png = await sharp(request.path, { failOn: 'none', ...UNLIMITED_PIXELS })
      .rotate()
      .png()
      .toBuffer();
    return engine.recognize(png);
  }

  private async engineFor(languages: readonly string[], directory: string): Promise<OcrEngine> {
    const current = this.engine;
    if (current !== null && current.languages.join('+') === languages.join('+')) return current;
    await this.close();
    this.engine = new OcrEngine(languages, directory);
    return this.engine;
  }
}
