import { joinedText, markupPart, readParts } from './archive';

const CHAPTER = /\.(?:xhtml|html|htm)$/iu;

export async function epubText(path: string): Promise<string> {
  return joinedText(await readParts(path, (name) => CHAPTER.test(name), markupPart));
}
