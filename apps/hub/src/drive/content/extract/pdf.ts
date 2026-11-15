import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';

export async function pdfText(path: string): Promise<string> {
  const bytes = await readFile(path);
  const document = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text } = await extractText(document, { mergePages: true });
    return text.replace(/\s+/gu, ' ').trim();
  } finally {
    await document.loadingTask.destroy();
  }
}
