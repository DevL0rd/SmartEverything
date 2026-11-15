import { joinedText, markupPart, readParts } from './archive';

export async function opendocumentText(path: string): Promise<string> {
  return joinedText(await readParts(path, (name) => name === 'content.xml', markupPart));
}
