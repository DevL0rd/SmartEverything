import { decodeEntities, markupText } from './markup';
import { joinedText, markupPart, readParts } from './archive';

const WORD_PART = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/u;

const SLIDE_PART = /^ppt\/(?:slides\/slide\d+|notesSlides\/notesSlide\d+|comments\/[^/]+)\.xml$/u;

const SHEET_PART = /^xl\/worksheets\/sheet\d+\.xml$/u;

const SHARED_STRINGS = 'xl/sharedStrings.xml';

const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu;

const VALUE = /<v>([\s\S]*?)<\/v>/u;

const INLINE = /<is>([\s\S]*?)<\/is>/u;

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`, 'u').exec(attributes)?.[1];
}

function cellText(attributes: string, body: string): string {
  const kind = attribute(attributes, 't');
  if (kind === 's') return '';
  return kind === 'inlineStr'
    ? markupText(INLINE.exec(body)?.[1] ?? '')
    : decodeEntities(VALUE.exec(body)?.[1] ?? '');
}

function sheetText(xml: string): string {
  return [...xml.matchAll(CELL)]
    .map((match) => cellText(match[1] ?? '', match[2] ?? ''))
    .filter((text) => text !== '')
    .join(' ');
}

export async function documentText(path: string): Promise<string> {
  return joinedText(await readParts(path, (name) => WORD_PART.test(name), markupPart));
}

export async function presentationText(path: string): Promise<string> {
  return joinedText(await readParts(path, (name) => SLIDE_PART.test(name), markupPart));
}

export async function spreadsheetText(path: string): Promise<string> {
  return joinedText(
    await readParts(
      path,
      (name) => name === SHARED_STRINGS || SHEET_PART.test(name),
      (name, xml) =>
        name === SHARED_STRINGS ? markupText(xml.replace(/<\/si>/gu, '</p>')) : sheetText(xml),
    ),
  );
}
