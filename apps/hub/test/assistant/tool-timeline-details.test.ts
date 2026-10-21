import { describe, expect, it } from 'vitest';
import { toolTimelineDetails } from '../../src/assistant/conversation/tool-timeline-details';

describe('tool timeline details', () => {
  it('shows the input of a settings tool and hides only its secret fields', () => {
    const details = toolTimelineDetails(
      'settings_edit',
      {
        input: { section: 'ai', theme: 'dark', apiKey: 'sk-live-value' },
      },
      'call-1',
    );

    expect(details.input).toContain('"theme": "dark"');
    expect(details.input).toContain('"apiKey": "[redacted]"');
    expect(details.input).not.toContain('sk-live-value');
    expect(details.redacted).toBe(true);
  });

  it('leaves a tool input without secret fields untouched', () => {
    const details = toolTimelineDetails(
      'automation_edit',
      {
        input: { name: 'Porch light', authority: 'owner', url: 'https://example.com/hook' },
      },
      'call-1',
    );

    expect(details.input).toContain('"authority": "owner"');
    expect(details.input).toContain('https://example.com/hook');
    expect(details.redacted).toBe(false);
  });

  it('shows text input as written', () => {
    const details = toolTimelineDetails('run_command', { input: 'ls -la /home/user' }, 'call-1');

    expect(details.input).toBe('ls -la /home/user');
  });
});
