import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractText, hasTextReader, type ExtractedText } from '../../../src/drive/content/extract';
import { markupText } from '../../../src/drive/content/extract/markup';
import { pdfOf, zipOf } from './builders';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'drive-extract-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function put(name: string, data: Uint8Array | string): Promise<string> {
  const path = join(folder, name);
  await writeFile(path, data);
  return path;
}

async function read(
  name: string,
  data: Uint8Array | string,
  mime = 'application/octet-stream',
): Promise<ExtractedText> {
  return extractText(await put(name, data), name, mime);
}

function utf16le(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
}

function utf16be(text: string): Buffer {
  const le = Buffer.from(text, 'utf16le');
  return Buffer.concat([Buffer.from([0xfe, 0xff]), le.swap16()]);
}

describe('plain text', () => {
  it('reads UTF-8, a UTF-8 BOM and UTF-16 in both byte orders', async () => {
    expect(await read('a.txt', 'Grüße  aus\nBerlin', 'text/plain')).toEqual({
      state: 'ok',
      body: 'Grüße aus Berlin',
    });
    expect(
      await read(
        'b.txt',
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom text')]),
      ),
    ).toEqual({
      state: 'ok',
      body: 'bom text',
    });
    expect(await read('c.txt', utf16le('little endian ünï'))).toEqual({
      state: 'ok',
      body: 'little endian ünï',
    });
    expect(await read('d.txt', utf16be('big endian ünï'))).toEqual({
      state: 'ok',
      body: 'big endian ünï',
    });
  });

  it('reads source code and structured text by extension', async () => {
    expect(await read('main.ts', 'export const lighthouse = 1;')).toEqual({
      state: 'ok',
      body: 'export const lighthouse = 1;',
    });
    expect(await read('data.json', '{"harbour":"night"}', 'application/json')).toEqual({
      state: 'ok',
      body: '{"harbour":"night"}',
    });
  });

  it('calls an empty file empty and binary data unsupported', async () => {
    expect(await read('empty.txt', '   \n')).toEqual({ state: 'empty' });
    const binary = await read('video.ts', Buffer.from([0x47, 0x40, 0x00, 0x10, 0x00]));
    expect(binary.state).toBe('unsupported');
  });

  it('has no reader for media and unknown types', async () => {
    expect(hasTextReader('clip.mp4', 'video/mp4')).toBe(false);
    expect(await read('clip.mp4', 'xx', 'video/mp4')).toMatchObject({ state: 'unsupported' });
  });
});

describe('markup', () => {
  it('strips tags, scripts and styles, keeps words apart and decodes entities', async () => {
    const html =
      '<html><head><title>Port</title><style>p { color: red }</style><script>var secret = 1;</script></head>' +
      '<body><p>Fish &amp; chips</p><td>cold</td><td>warm&nbsp;tea</td><b>bo</b><i>ld</i> &#233;&#x41;</body></html>';
    expect(markupText(html)).toBe('Port Fish & chips cold warm tea bold éA');
    expect(await read('page.html', html, 'text/html')).toEqual({
      state: 'ok',
      body: 'Port Fish & chips cold warm tea bold éA',
    });
  });
});

describe('PDF', () => {
  it('reads the text layer', async () => {
    expect(await read('doc.pdf', pdfOf('Harbour inspection report'))).toEqual({
      state: 'ok',
      body: 'Harbour inspection report',
    });
  });

  it('calls a PDF without a text layer empty', async () => {
    expect(await read('scan.pdf', pdfOf(''))).toEqual({ state: 'empty' });
  });

  it('fails with a reason on a file that is not a PDF', async () => {
    expect(await read('broken.pdf', 'not a pdf')).toMatchObject({ state: 'failed' });
  });
});

describe('office and book formats', () => {
  it('reads Word text across runs, paragraphs, headers and comments', async () => {
    const document =
      '<w:document><w:body><w:p><w:r><w:t>Light</w:t></w:r><w:r><w:t>house</w:t></w:r></w:p><w:p><w:r><w:t>second paragraph</w:t></w:r></w:p></w:body></w:document>';
    const header = '<w:hdr><w:p><w:r><w:t>Header words</w:t></w:r></w:p></w:hdr>';
    const archive = zipOf([
      { name: 'word/document.xml', data: document, method: 'deflated' },
      { name: 'word/header1.xml', data: header },
      { name: 'word/styles.xml', data: '<w:styles><w:t>ignored</w:t></w:styles>' },
    ]);
    expect(await read('letter.docx', archive)).toEqual({
      state: 'ok',
      body: 'Lighthouse second paragraph\nHeader words',
    });
  });

  it('reads spreadsheet shared strings, inline strings and numbers but not string indexes', async () => {
    const shared =
      '<sst><si><t>Budget</t></si><si><r><t>Tea</t></r><r><t> leaves</t></r></si></sst>';
    const sheet =
      '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42.5</v></c>' +
      '<c r="C1" t="inlineStr"><is><t>Inline note</t></is></c><c r="D1" t="str"><v>formula text</v></c></row></sheetData></worksheet>';
    const archive = zipOf([
      { name: 'xl/sharedStrings.xml', data: shared },
      { name: 'xl/worksheets/sheet1.xml', data: sheet, method: 'deflated' },
    ]);
    const result = await read('book.xlsx', archive);
    expect(result).toEqual({
      state: 'ok',
      body: 'Budget Tea leaves\n42.5 Inline note formula text',
    });
  });

  it('reads slides and speaker notes in slide order', async () => {
    const slide = (text: string): string =>
      `<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`;
    const archive = zipOf([
      { name: 'ppt/slides/slide10.xml', data: slide('tenth') },
      { name: 'ppt/slides/slide2.xml', data: slide('second') },
      { name: 'ppt/notesSlides/notesSlide2.xml', data: slide('remember the jokes') },
    ]);
    expect(await read('deck.pptx', archive)).toEqual({
      state: 'ok',
      body: 'remember the jokes\nsecond\ntenth',
    });
  });

  it('reads OpenDocument text', async () => {
    const content =
      '<office:document-content><office:body><office:text><text:p>Open</text:p><text:p>format <text:span>text</text:span></text:p></office:text></office:body></office:document-content>';
    expect(await read('note.odt', zipOf([{ name: 'content.xml', data: content }]))).toEqual({
      state: 'ok',
      body: 'Open format text',
    });
  });

  it('reads the chapters of an EPUB', async () => {
    const chapter = (words: string): string =>
      `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>${words}</h1></body></html>`;
    const archive = zipOf([
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'OEBPS/ch1.xhtml', data: chapter('Chapter one') },
      { name: 'OEBPS/ch2.xhtml', data: chapter('Chapter two'), method: 'deflated' },
      { name: 'OEBPS/cover.jpg', data: 'jpeg bytes' },
    ]);
    expect(await read('story.epub', archive)).toEqual({
      state: 'ok',
      body: 'Chapter one\nChapter two',
    });
  });

  it('fails with a reason when an office file is not a zip', async () => {
    expect(await read('old.docx', 'plain bytes')).toMatchObject({ state: 'failed' });
  });
});
