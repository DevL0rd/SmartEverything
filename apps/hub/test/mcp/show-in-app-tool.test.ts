import { describe, expect, it } from 'vitest';
import { toolGuide } from '../../src/ai-tools/tool-guide';
import { serverInstructions } from '../../src/extensions/mcp/instructions';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';

const OPEN = { action: 'open', target: { kind: 'section', section: 'fitness' }, focus: 'sleep' };

describe('the show_in_app tool', () => {
  it('is one assistant tool that is not read only and says when to use it', () => {
    const listing = toolNamed('show_in_app')?.listing;
    expect(listing?.description).toContain('Only when they ask to see');
    expect(listing?.annotations.readOnlyHint).toBe(false);
  });

  it('takes an action, a target, a focus and an app id, and nothing else', () => {
    const input = toolNamed('show_in_app')?.input;
    expect(input?.safeParse(OPEN).success).toBe(true);
    expect(input?.safeParse({ action: 'dismiss' }).success).toBe(true);
    expect(
      input?.safeParse({ ...OPEN, appId: '33333333-3333-4333-8333-333333333333' }).success,
    ).toBe(true);
    expect(input?.safeParse({ action: 'close' }).success).toBe(false);
    expect(input?.safeParse({ ...OPEN, page: 'home' }).success).toBe(false);
  });

  it('is its own part, not a view of another tool', () => {
    expect(partCallOf('show_in_app', OPEN)).toEqual({ name: 'show_in_app', args: OPEN });
  });

  it('is explained to the AI only where the tool is enabled, and only on request', () => {
    expect(toolGuide(['show_in_app'])).toContain('only when the person asks to be shown');
    expect(toolGuide(['get_home'])).not.toContain('show_in_app');
    expect(serverInstructions(['show_in_app'])).toContain('only when they ask to be shown it');
    expect(serverInstructions(['get_home'])).not.toContain('show_in_app');
  });
});
