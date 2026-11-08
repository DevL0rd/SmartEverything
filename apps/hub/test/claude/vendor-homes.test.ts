import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { hubLayout, nodeLayout } from '../../src/data-layout';
import { helperCommand, linkLaunchOf } from '../../src/claude/link-launch';
import { claudeLocations } from '../../src/claude/locations';
import { signInInstruction, subscriptionEnvironment } from '../../src/claude/provider/options';
import { hubClaudeSites, nodeClaudeSites } from '../../src/claude/sites';
import { modSource } from '../../src/claude/link-mod';

afterEach(() => {
  vi.unstubAllEnvs();
});

it('launches hub Claude with the hub home and the Computer role with the inherited one', () => {
  vi.stubEnv('CLAUDE_CONFIG_DIR', '/home/person/.claude');
  vi.stubEnv('ANTHROPIC_API_KEY', 'secret');
  const hub = subscriptionEnvironment('/data/system/ai/claude-home');
  expect(hub['CLAUDE_CONFIG_DIR']).toBe('/data/system/ai/claude-home');
  expect(hub['ANTHROPIC_API_KEY']).toBeUndefined();
  const computer = subscriptionEnvironment(null);
  expect(computer['CLAUDE_CONFIG_DIR']).toBe('/home/person/.claude');
  expect(computer['ANTHROPIC_API_KEY']).toBeUndefined();
});

it('reads sessions from the hub home on the hub and from the person home on a Computer', () => {
  vi.stubEnv('CLAUDE_CONFIG_DIR', '');
  expect(claudeLocations(null).projects).toBe(join(homedir(), '.claude', 'projects'));
  expect(claudeLocations('/data/claude-home').sessions).toBe(join('/data/claude-home', 'sessions'));
  vi.stubEnv('CLAUDE_CONFIG_DIR', '/home/person/.claude');
  expect(claudeLocations(null).projects).toBe(join('/home/person/.claude', 'projects'));
  expect(claudeLocations('/data/claude-home').projects).toBe(join('/data/claude-home', 'projects'));
});

it('names the exact sign-in command with the real home path', () => {
  expect(signInInstruction('/data/system/ai/claude-home')).toContain(
    'CLAUDE_CONFIG_DIR=/data/system/ai/claude-home claude auth login --claudeai',
  );
  expect(signInInstruction(null)).toContain('Sign into the official Claude CLI locally');
});

it('takes the hub sites from the layout and the Computer sites from the node layout', () => {
  const layout = hubLayout('/data', {});
  const hub = hubClaudeSites(layout);
  expect(hub).toEqual({
    directory: layout.system.ai.claude,
    ready: layout.system.run.ready,
    home: layout.system.ai.claudeHome,
  });
  const node = nodeLayout('/node');
  expect(nodeClaudeSites(node)).toEqual({
    directory: node.claudeHost,
    ready: node.ready,
    home: null,
  });
});

it('hands the helper the Claude folder and the ready file', () => {
  const launch = linkLaunchOf({ directory: '/d/claude', ready: '/d/ready.json' });
  expect(helperCommand(launch, 'hook')).toContain("--claude '/d/claude' --ready '/d/ready.json'");
  expect(modSource(launch)).toContain('"/d/claude"');
  expect(modSource(launch)).toContain('"/d/ready.json"');
  expect(modSource(launch)).not.toContain('--data');
});
