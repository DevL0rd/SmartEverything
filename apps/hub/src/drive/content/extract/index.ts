import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { epubText } from './epub';
import { markupText } from './markup';
import { documentText, presentationText, spreadsheetText } from './ooxml';
import { opendocumentText } from './odf';
import { pdfText } from './pdf';
import { BinaryContentError, decodeText, plainText } from './plain';

export type ExtractedText =
  | { readonly state: 'ok'; readonly body: string }
  | { readonly state: 'empty' }
  | { readonly state: 'unsupported'; readonly reason: string }
  | { readonly state: 'failed'; readonly reason: string };

type Reader = (path: string) => Promise<string>;

async function readPlain(path: string): Promise<string> {
  return plainText(await readFile(path));
}

async function readMarkup(path: string): Promise<string> {
  return markupText(decodeText(await readFile(path)));
}

const TEXT_EXTENSIONS = [
  'txt',
  'text',
  'md',
  'markdown',
  'rst',
  'org',
  'tex',
  'csv',
  'tsv',
  'log',
  'json',
  'jsonl',
  'ndjson',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'properties',
  'env',
  'srt',
  'vtt',
  'sub',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'swift',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'sql',
  'css',
  'scss',
  'sass',
  'less',
  'lua',
  'pl',
  'r',
  'scala',
  'dart',
  'gradle',
  'vue',
  'svelte',
  'graphql',
  'proto',
  'tf',
  'diff',
  'patch',
  'gitignore',
  'ics',
  'vcf',
];

const MARKUP_EXTENSIONS = ['html', 'htm', 'xhtml', 'xml', 'svg', 'rss', 'atom', 'plist'];

const READERS: Readonly<Record<string, Reader>> = {
  ...Object.fromEntries(TEXT_EXTENSIONS.map((extension) => [extension, readPlain])),
  ...Object.fromEntries(MARKUP_EXTENSIONS.map((extension) => [extension, readMarkup])),
  pdf: pdfText,
  docx: documentText,
  docm: documentText,
  dotx: documentText,
  xlsx: spreadsheetText,
  xlsm: spreadsheetText,
  xltx: spreadsheetText,
  pptx: presentationText,
  pptm: presentationText,
  ppsx: presentationText,
  potx: presentationText,
  odt: opendocumentText,
  ods: opendocumentText,
  odp: opendocumentText,
  ott: opendocumentText,
  ots: opendocumentText,
  otp: opendocumentText,
  epub: epubText,
};

function extensionOf(name: string): string {
  return extname(name).slice(1).toLowerCase();
}

function readerFor(name: string, mime: string): Reader | undefined {
  const known = READERS[extensionOf(name)];
  if (known !== undefined) return known;
  return mime.startsWith('text/') && mime !== 'text/html' ? readPlain : undefined;
}

export function hasTextReader(name: string, mime: string): boolean {
  return readerFor(name, mime) !== undefined;
}

export async function extractText(
  path: string,
  name: string,
  mime: string,
): Promise<ExtractedText> {
  const reader = readerFor(name, mime);
  if (reader === undefined) {
    return { state: 'unsupported', reason: 'The hub has no reader for this kind of file.' };
  }
  try {
    const body = await reader(path);
    return body === '' ? { state: 'empty' } : { state: 'ok', body };
  } catch (cause) {
    if (cause instanceof BinaryContentError) {
      return { state: 'unsupported', reason: cause.message };
    }
    return { state: 'failed', reason: cause instanceof Error ? cause.message : String(cause) };
  }
}
