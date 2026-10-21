import { MCP_TOOLS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { toolGuide } from '../../src/ai-tools/tool-guide';
import { serverInstructions } from '../../src/extensions/mcp/instructions';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';

const OPEN = { action: 'open', target: { kind: 'section', section: 'fitness' }, focus: 'sleep' };

describe('the app_show tool', () => {
  it('is one assistant tool that is not read only and says when to use it', () => {
    const listing = toolNamed('app_show')?.listing;
    expect(listing?.description).toContain('Only when they ask to see');
    expect(listing?.annotations.readOnlyHint).toBe(false);
  });

  it('takes an action, a target, a focus and an app id, and nothing else', () => {
    const input = toolNamed('app_show')?.input;
    expect(input?.safeParse(OPEN).success).toBe(true);
    expect(input?.safeParse({ action: 'dismiss' }).success).toBe(true);
    expect(
      input?.safeParse({ ...OPEN, appId: '33333333-3333-4333-8333-333333333333' }).success,
    ).toBe(true);
    expect(input?.safeParse({ action: 'close' }).success).toBe(false);
    expect(input?.safeParse({ ...OPEN, page: 'home' }).success).toBe(false);
  });

  it('is its own part, not a view of another tool', () => {
    expect(partCallOf('app_show', OPEN)).toEqual({ name: 'app_show', args: OPEN });
  });

  it('is explained to the AI only where the tool is enabled, and only on request', () => {
    expect(MCP_TOOLS.find((tool) => tool.name === 'app_show')?.description).toContain(
      'Only when they ask to see, open, find or be shown something',
    );
    expect(toolGuide(['home_read'])).not.toContain('app_show');
    expect(serverInstructions(['app_show'])).toContain('only when they ask to be shown it');
    expect(serverInstructions(['home_read'])).not.toContain('app_show');
  });
});
