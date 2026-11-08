import { describe, expect, it, vi } from 'vitest';
import { APP_PUBLICATION_INPUT } from '@smarteverything/domain';
import { desktopPublicationId, executeUiPublication } from '../self-update-app-executor.ts';

const RUN = '01922cf6-fc0f-76b8-aec5-016cd503c925';
const INPUT = APP_PUBLICATION_INPUT.parse({ action: 'ui', runId: RUN, notes: 'UI fixes' });

describe('UI publication execution', () => {
  it('publishes Android and desktop and gives desktop its own reproducible offer ID', async () => {
    const android = vi.fn();
    const desktop = vi.fn();
    await executeUiPublication(INPUT, {
      entries: (): Promise<readonly { readonly id: string }[]> => Promise.resolve([]),
      android,
      desktop,
    });
    expect(android).toHaveBeenCalledOnce();
    expect(desktop).toHaveBeenCalledExactlyOnceWith(desktopPublicationId(RUN));
    expect(desktopPublicationId(RUN)).not.toBe(RUN);
  });

  it('keeps a committed Android offer when desktop fails and resumes only the missing platform', async () => {
    const entries: { readonly id: string }[] = [];
    const android = vi.fn((): Promise<void> => {
      entries.push({ id: RUN });
      return Promise.resolve();
    });
    const desktop = vi
      .fn()
      .mockRejectedValueOnce(new Error('desktop export failed'))
      .mockImplementationOnce((id: string): Promise<void> => {
        entries.push({ id });
        return Promise.resolve();
      });
    const ports = {
      entries: (): Promise<readonly { readonly id: string }[]> => Promise.resolve(entries),
      android,
      desktop,
    };
    await expect(executeUiPublication(INPUT, ports)).rejects.toThrow('desktop export failed');
    await executeUiPublication(INPUT, ports);
    await executeUiPublication(INPUT, ports);
    expect(android).toHaveBeenCalledOnce();
    expect(desktop).toHaveBeenCalledTimes(2);
    expect(entries.map(({ id }) => id)).toEqual([RUN, desktopPublicationId(RUN)]);
  });

  it('does not publish desktop after Android fails and retries the same request safely', async () => {
    const android = vi
      .fn()
      .mockRejectedValueOnce(new Error('Android incompatible'))
      .mockResolvedValueOnce(undefined);
    const desktop = vi.fn();
    const ports = {
      entries: (): Promise<readonly { readonly id: string }[]> => Promise.resolve([]),
      android,
      desktop,
    };
    await expect(executeUiPublication(INPUT, ports)).rejects.toThrow('Android incompatible');
    expect(desktop).not.toHaveBeenCalled();
    await executeUiPublication(INPUT, ports);
    expect(android).toHaveBeenCalledTimes(2);
    expect(desktop).toHaveBeenCalledOnce();
  });
});
