import { PRINTER_SECTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { searchEntries } from '../../../src/plugins/builtin/printer/search';
import type { PrinterSession } from '../../../src/plugins/builtin/printer/session';
import { FakeIppPrinter } from './fake-ipp-printer';
import { newRig, openSession } from './rig';

const OTHER_PAGES = ['overview', 'settings'];

async function entries(): Promise<ReturnType<typeof searchEntries>> {
  const printer = new FakeIppPrinter();
  await printer.start();
  const session: PrinterSession = await openSession(newRig(), printer);
  try {
    return searchEntries([session]);
  } finally {
    session.stop();
    await printer.stop();
  }
}

describe('printer search entries', () => {
  it('only point at pages the device screen has', async () => {
    for (const entry of await entries()) {
      expect(entry.target.kind).toBe('device');
      const section = entry.target.kind === 'device' ? entry.target.section : null;
      expect([...PRINTER_SECTIONS, ...OTHER_PAGES]).toContain(section);
    }
  });

  it('offer printing a file and printing a test page on the print page', async () => {
    const found = await entries();
    const titles = found.map((entry) => entry.title);
    expect(titles.some((title) => title.endsWith('Print a file'))).toBe(true);
    expect(titles.some((title) => title.endsWith('Print test page'))).toBe(true);
    for (const entry of found.filter((item) => item.title.includes('Print test page'))) {
      expect(entry.target).toMatchObject({ section: 'print' });
    }
  });

  it('send print history to the jobs page, not to the generic history of readings', async () => {
    const history = (await entries()).find((entry) => entry.title.endsWith('Print history'));
    expect(history?.target).toMatchObject({ section: 'jobs' });
  });
});
