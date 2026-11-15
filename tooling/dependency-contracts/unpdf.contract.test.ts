import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

function buildPdf(pages: readonly string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((content, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(5 + index * 2)} 0 R >>`,
    );
    objects.push(`<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`);
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

const showing = (text: string): string => `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;

describe('unpdf contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'unpdf')).toBe(installedVersion('unpdf'));
  });

  it('reads the text layer of every page merged into one string', async () => {
    const pdf = await getDocumentProxy(
      buildPdf([showing('Quarterly invoice 4821'), showing('Second page')]),
    );
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    expect(totalPages).toBe(2);
    expect(text).toContain('Quarterly invoice 4821');
    expect(text).toContain('Second page');
  });

  it('keeps the pages apart when asked not to merge them', async () => {
    const pdf = await getDocumentProxy(buildPdf([showing('First'), showing('Second')]));
    const { text } = await extractText(pdf);
    expect(text).toHaveLength(2);
    expect(text[0]).toContain('First');
    expect(text[1]).toContain('Second');
  });

  it('gives an empty text for a page that only draws', async () => {
    const pdf = await getDocumentProxy(buildPdf(['0 0 100 100 re f']));
    const { text } = await extractText(pdf, { mergePages: true });
    expect(text.trim()).toBe('');
  });

  it('refuses bytes that are not a PDF document', async () => {
    await expect(getDocumentProxy(new TextEncoder().encode('not a pdf at all'))).rejects.toThrow();
  });
});
