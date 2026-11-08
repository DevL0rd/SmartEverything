import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layoutForLocation } from '../../src/data-layout';

const ROOT = resolve('/srv/hub-data');
const ENVIRONMENT = {
  CLAUDE_CONFIG_DIR: join(ROOT, 'vendor', 'claude'),
  CODEX_HOME: join(ROOT, 'vendor', 'codex'),
};

describe('layoutForLocation', () => {
  it('opens an active install using the structured data folder', () => {
    const layout = layoutForLocation({ root: ROOT, state: 'active' }, ENVIRONMENT);

    expect(layout.system.config.service).toBe(join(ROOT, 'system', 'config', 'service.json'));
    expect(layout.system.database.file).toBe(join(ROOT, 'system', 'database', 'smarteverything.db'));
    expect(layout.system.keys.ownerToken).toBe(join(ROOT, 'system', 'keys', 'owner-token'));
    expect(layout.system.ai.claudeHome).toBe(join(ROOT, 'system', 'ai', 'claude-home'));
  });

  it('keeps a pending migration on its existing files and vendor homes', () => {
    const layout = layoutForLocation({ root: ROOT, state: 'pending-v1' }, ENVIRONMENT);

    expect(layout.system.config.service).toBe(join(ROOT, 'service.json'));
    expect(layout.system.database.file).toBe(join(ROOT, 'smarteverything.db'));
    expect(layout.system.keys.ownerToken).toBe(join(ROOT, 'owner-token'));
    expect(layout.system.ai.claudeHome).toBe(ENVIRONMENT.CLAUDE_CONFIG_DIR);
    expect(layout.system.ai.codexHome).toBe(ENVIRONMENT.CODEX_HOME);
  });
});
