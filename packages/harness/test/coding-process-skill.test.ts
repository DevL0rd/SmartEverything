import { describe, expect, it } from 'vitest';
import { PRODUCT_SKILLS } from '../src/composition/product-skill-catalogue';

const skill = PRODUCT_SKILLS.skills.find(
  (entry) => entry.name === 'smarteverything-coding-process',
);

describe('the coding process skill', () => {
  it('makes the primary AI a coordinator that delegates substantive work to agents', () => {
    const content = skill?.content ?? '';
    expect(content).toContain('You are the coordinator');
    expect(content).toContain('`subagent_run`');
    expect(content).toContain('Delegate research, code reading, implementation and review');
    expect(content).toContain('Run at most four agents at once');
    expect(content).toContain('do not start any agents');
    expect(content).toContain('Reviewers are fresh agents');
  });

  it('picks the model per role, reuses agents only while small and reviews with fresh reviewers', () => {
    const content = skill?.content ?? '';
    expect(content).toContain('Choose the model per role');
    expect(content).toContain('otherwise start a fresh one');
    expect(content).toContain('fresh single-use reviewer');
    expect(content).toContain('Be self-sufficient');
  });

  it('carries no device, user or report specifics of the owner’s own setup', () => {
    const content = skill?.content ?? '';
    expect(content).not.toMatch(/CachyOS|pacman|paru|devl0rd|Discord/i);
  });
});
