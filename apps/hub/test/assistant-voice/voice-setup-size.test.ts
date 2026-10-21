import { describe, expect, it } from 'vitest';
import { SE_TOOLS } from '../../src/ai-tools/se-tools';
import { geminiDeclarationOf } from '../../src/ai-tools/tool-adapters';
import { chatSet, toolIndex } from '../../src/ai-tools/tool-sets';
import { toolGuide } from '../../src/ai-tools/tool-guide';
import { liveInstructions } from '../../src/assistant-voice/instructions';
import { VOICE_DEFERRED_TOOLS, voiceToolIndex } from '../../src/assistant-voice/voice-deferred';
import { hostedSet, voiceSet } from '../../src/assistant-voice/voice-tools';
import { REACH_TOOL_NAMES } from '../../src/reach/hosted-call';

const TEXT_CHARS_PER_TOKEN = 4;
const JSON_CHARS_PER_TOKEN = 3.8;
const HOSTED_BUDGET_TOKENS = 5200;
const APP_BUDGET_TOKENS = 6400;

interface Setup {
  readonly systemTokens: number;
  readonly declarationTokens: number;
}

function setupOf(hosted: boolean): Setup {
  const visible = hosted ? SE_TOOLS.filter((tool) => !REACH_TOOL_NAMES.has(tool.name)) : SE_TOOLS;
  const declarations = hostedSet(
    voiceSet(visible, true, !hosted),
    hosted ? { hiddenTools: REACH_TOOL_NAMES } : null,
  ).map(geminiDeclarationOf);
  const system = liveInstructions({
    names: ['Coordinator'],
    home: 'Home',
    style: undefined,
    instructions: '',
    place: null,
    unavailable: null,
    toolIndex: voiceToolIndex(visible),
    catalogue: '',
    guide: toolGuide(visible.map((tool) => tool.name)),
    sight: !hosted,
    stopLooking: true,
  });
  return {
    systemTokens: Math.ceil(system.length / TEXT_CHARS_PER_TOKEN),
    declarationTokens: Math.ceil(JSON.stringify(declarations).length / JSON_CHARS_PER_TOKEN),
  };
}

function overBudget(kind: string, setup: Setup, budget: number): string {
  const total = setup.systemTokens + setup.declarationTokens;
  return `The ${kind} Live setup is about ${String(total)} tokens (system ${String(setup.systemTokens)}, tool declarations ${String(setup.declarationTokens)}), over the ${String(budget)} budget. Every turn of every call pays for it again: move rarely used tools behind tool_call, shorten schemas or trim the guide instead of raising the budget.`;
}

describe('the Live setup size', () => {
  it('keeps the hosted wake setup within its token budget', () => {
    const setup = setupOf(true);
    expect(
      setup.systemTokens + setup.declarationTokens,
      overBudget('hosted', setup, HOSTED_BUDGET_TOKENS),
    ).toBeLessThanOrEqual(HOSTED_BUDGET_TOKENS);
  });

  it('keeps the app setup within its token budget', () => {
    const setup = setupOf(false);
    expect(
      setup.systemTokens + setup.declarationTokens,
      overBudget('app', setup, APP_BUDGET_TOKENS),
    ).toBeLessThanOrEqual(APP_BUDGET_TOKENS);
  });
});

describe('the tools a call reaches through tool_call', () => {
  const tools = SE_TOOLS;

  it('are not declared in a call but stay declared for text chat', () => {
    const voice = voiceSet(tools, true, false).map((tool) => tool.name);
    const chat = chatSet(tools).map((tool) => tool.name);
    for (const name of VOICE_DEFERRED_TOOLS) {
      expect(voice).not.toContain(name);
      expect(chat).toContain(name);
    }
  });

  it('are listed in the call tool index and not in the text chat one as extra tools', () => {
    for (const name of VOICE_DEFERRED_TOOLS) {
      expect(voiceToolIndex(tools)).toContain(name);
      expect(toolIndex(tools)).not.toContain(name);
    }
  });
});
