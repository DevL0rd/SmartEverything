import { describe, expect, it } from 'vitest';
import {
  AUTO_LATEST_GEMINI_FLASH,
  NO_PRICES,
  type AiModelRow,
  type AiModelSuggested,
} from '@smarteverything/domain';
import { orderedEfforts } from './efforts';
import { suggestedItems } from './suggested-items';

const AT = '2026-10-10T00:00:00.000Z';

function row(id: string, name: string): AiModelRow {
  return {
    id,
    provider: 'openrouter',
    name,
    author: 'google',
    author_name: 'Google',
    family: name,
    description: '',
    created: AT,
    context_length: 1_000_000,
    max_output: null,
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: [],
    reasoning: 'none',
    efforts: ['high', 'low', 'medium'],
    default_effort: null,
    tools: true,
    alias_of: null,
    pricing: { ...NO_PRICES, input_per_mtok: 0.3, output_per_mtok: 2.5 },
    kinds: ['chat'],
    expires_at: null,
    synced_at: AT,
    gone_at: null,
  };
}

const FLASH = row('google/gemini-3.8-flash', 'Gemini 3.8 Flash');
const PRO = row('google/gemini-3.5-pro', 'Gemini 3.5 Pro');

function suggested(current: AiModelRow | null): AiModelSuggested {
  return {
    synced_at: AT,
    sync_error: null,
    default: {
      choice: AUTO_LATEST_GEMINI_FLASH,
      model_id: FLASH.id,
      name: 'Gemini 3.8 Flash (latest)',
      effort: null,
    },
    default_model: FLASH,
    current,
    favourites: [],
    recent: [FLASH],
    top_picks: [FLASH, PRO],
  };
}

function namesOf(data: AiModelSuggested, picked: string | null): readonly string[] {
  return suggestedItems(data, picked, () => undefined).flatMap((item) =>
    item.type === 'model' ? [item.model.name] : [],
  );
}

describe('suggested models', () => {
  it('shows the latest-rule model once when it is current', () => {
    expect(namesOf(suggested(FLASH), AUTO_LATEST_GEMINI_FLASH)).toEqual([
      'Gemini 3.8 Flash (latest)',
      'Gemini 3.5 Pro',
    ]);
  });

  it('shows a concrete current model once and drops its latest-rule twin', () => {
    expect(namesOf(suggested(FLASH), FLASH.id)).toEqual(['Gemini 3.8 Flash', 'Gemini 3.5 Pro']);
  });

  it('orders thinking levels low to high', () => {
    expect(orderedEfforts(['high', 'medium', 'low', 'max', 'xhigh'])).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });
});
