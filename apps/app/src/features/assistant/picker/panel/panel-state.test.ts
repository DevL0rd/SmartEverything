import { describe, expect, it } from 'vitest';
import { modelPanelPage, panelPageChange, panelParent } from './panel-state';

describe('chat model panel routes', () => {
  it('keeps the routed harness catalogue in the model panel', () => {
    expect(modelPanelPage('model', 'control', 'dsh')).toBe('library');
  });

  it('keeps model settings and machine actions in their respective pages', () => {
    expect(modelPanelPage('model', undefined, 'dsh')).toBe('main');
    expect(modelPanelPage('model', 'unknown', 'dsh')).toBe('main');
    expect(modelPanelPage('model', 'control', 'codex')).toBe('main');
    expect(modelPanelPage('device', 'control', 'dsh')).toBe('machine');
  });

  it('leaves native operations and standalone provider work to the provider sheet', () => {
    expect(modelPanelPage('set_model', 'control', 'claude')).toBeNull();
    expect(modelPanelPage(undefined, 'overview', 'dsh')).toBeNull();
  });


});

const MAIN = { page: 'main', machineParent: 'main', returnFocus: null } as const;

describe('nested model panel navigation', () => {
  it('returns from a required machine and folder to the original catalogue', () => {
    const catalogue = panelPageChange(MAIN, 'library');
    const machine = panelPageChange(catalogue, 'machine');
    const folder = panelPageChange(machine, 'folder');
    expect(panelParent('main', folder)).toBe('machine');
    const restoredMachine = panelPageChange(folder, 'machine');
    expect(restoredMachine.returnFocus).toBe('folder');
    expect(panelParent('main', restoredMachine)).toBe('library');
    expect(panelPageChange(restoredMachine, 'library').returnFocus).toBe('machine');
  });

  it.each(['thinking', 'image', 'machine'] as const)('restores the %s launcher on Back', (page) => {
    const opened = panelPageChange(MAIN, page);
    expect(panelParent('main', opened)).toBe('main');
    expect(panelPageChange(opened, 'main').returnFocus).toBe(page);
  });
});
