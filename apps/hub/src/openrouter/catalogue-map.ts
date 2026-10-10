import {
  AI_EFFORT,
  NO_PRICES,
  type AiEffort,
  type AiModelKind,
  type AiModelRow,
  type AiPricing,
  type AiReasoningMode,
  type GoogleModel,
} from '@smarteverything/domain';
import type { OrImageModel, OrImagePrice, OrModel, OrPricing, OrVideoModel } from './wire';

const MILLION = 1_000_000;
const GENERIC_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high'];

export interface Named {
  readonly name: string;
  readonly author: string;
  readonly authorName: string;
}

function title(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function namedOf(id: string, fullName: string): Named {
  const author = (id.split('/')[0] ?? id).replace(/^~/, '');
  const split = /^([^:]{1,80}):\s+(.+)$/.exec(fullName);
  if (split?.[1] !== undefined && split[2] !== undefined) {
    return { name: split[2].slice(0, 120), author, authorName: split[1] };
  }
  return { name: fullName.slice(0, 120), author, authorName: title(author) };
}

export function familyOf(id: string): string {
  const [author = '', slug = id] = id.replace(/^~/, '').split('/');
  const family = slug
    .replace(/:.*$/, '')
    .replace(/-\d{4,}$/, '')
    .split('-')
    .filter((part) => !/^v?\d+(\.\d+)*[a-z]?$/.test(part))
    .join('-');
  return `${author}/${family === '' ? slug : family}`;
}

const isoOf = (seconds: number): string => new Date(seconds * 1000).toISOString();

const perMillion = (price: number | undefined): number | null =>
  price === undefined || price < 0 ? null : Math.round(price * MILLION * 1e6) / 1e6;

const perUnit = (price: number | undefined): number | null =>
  price === undefined || price < 0 ? null : price;

function tiersOf(pricing: OrPricing): AiPricing['tiers'] {
  return (pricing.overrides ?? []).flatMap((tier) =>
    tier.min_prompt_tokens === undefined
      ? []
      : [
          {
            min_prompt_tokens: tier.min_prompt_tokens,
            input_per_mtok: perMillion(tier.prompt),
            output_per_mtok: perMillion(tier.completion),
            cache_read_per_mtok: perMillion(tier.input_cache_read),
            cache_write_per_mtok: perMillion(tier.input_cache_write),
          },
        ],
  );
}

export function pricingOf(pricing: OrPricing): AiPricing {
  return {
    ...NO_PRICES,
    variable: pricing.prompt < 0 || pricing.completion < 0,
    input_per_mtok: perMillion(pricing.prompt),
    output_per_mtok: perMillion(pricing.completion),
    cache_read_per_mtok: perMillion(pricing.input_cache_read),
    cache_write_per_mtok: perMillion(pricing.input_cache_write),
    reasoning_per_mtok: perMillion(pricing.internal_reasoning),
    audio_in_per_mtok: perMillion(pricing.audio),
    audio_out_per_mtok: perMillion(pricing.audio_output),
    image_out_per_mtok: perMillion(pricing.image_output),
    per_image_in: perUnit(pricing.image),
    per_request: perUnit(pricing.request),
    per_web_search: perUnit(pricing.web_search),
    tiers: tiersOf(pricing),
  };
}

export interface Efforts {
  readonly reasoning: AiReasoningMode;
  readonly efforts: AiEffort[];
  readonly defaultEffort: AiEffort | null;
  readonly unknown: string[];
}

function reasoningOf(model: OrModel, reasons: boolean): AiReasoningMode {
  if (model.reasoning?.mandatory === true) {
    return 'mandatory';
  }
  return reasons ? 'optional' : 'none';
}

export function effortsOf(model: OrModel): Efforts {
  const reasons = model.supported_parameters.includes('reasoning');
  const listed = model.reasoning?.supported_efforts ?? [];
  const known = listed.flatMap((effort) => {
    const parsed = AI_EFFORT.safeParse(effort);
    return parsed.success ? [parsed.data] : [];
  });
  const efforts = known.length > 0 || !reasons ? known : [...GENERIC_EFFORTS];
  const listedDefault = AI_EFFORT.safeParse(model.reasoning?.default_effort);
  return {
    reasoning: reasoningOf(model, reasons),
    efforts,
    defaultEffort:
      listedDefault.success && efforts.includes(listedDefault.data) ? listedDefault.data : null,
    unknown: listed.filter((effort) => !AI_EFFORT.safeParse(effort).success),
  };
}

export function kindsOf(input: readonly string[], output: readonly string[]): AiModelKind[] {
  const kinds: AiModelKind[] = [];
  if (output.includes('text') && input.includes('text')) {
    kinds.push('chat');
  }
  if (output.includes('image')) {
    kinds.push('image');
  }
  if (output.includes('video')) {
    kinds.push('video');
  }
  if (output.includes('embeddings')) {
    kinds.push('embed');
  }
  return kinds;
}

export function chatModelRow(model: OrModel, syncedAt: string, efforts: Efforts): AiModelRow {
  const input = model.architecture.input_modalities;
  const output = model.architecture.output_modalities;
  return {
    id: model.id,
    provider: 'openrouter',
    ...nameFields(model.id, model.name),
    description: model.description.slice(0, 4000),
    created: isoOf(model.created),
    context_length: model.context_length,
    max_output: model.top_provider.max_completion_tokens ?? null,
    input_modalities: input,
    output_modalities: output,
    supported_parameters: model.supported_parameters,
    reasoning: efforts.reasoning,
    efforts: efforts.efforts,
    default_effort: efforts.defaultEffort,
    tools: model.supported_parameters.includes('tools'),
    alias_of: model.alias_target?.slug ?? null,
    pricing: pricingOf(model.pricing),
    kinds: kindsOf(input, output),
    expires_at: model.expiration_date ?? null,
    synced_at: syncedAt,
    gone_at: null,
  };
}

function nameFields(
  id: string,
  fullName: string,
): Pick<AiModelRow, 'name' | 'author' | 'author_name' | 'family'> {
  const named = namedOf(id, fullName);
  return {
    name: named.name,
    author: named.author,
    author_name: named.authorName,
    family: familyOf(id),
  };
}

function mediaRow(
  base: { id: string; name: string; description: string; created: number },
  syncedAt: string,
): Omit<AiModelRow, 'input_modalities' | 'output_modalities' | 'pricing' | 'kinds'> {
  return {
    id: base.id,
    provider: 'openrouter',
    ...nameFields(base.id, base.name),
    description: base.description.slice(0, 4000),
    created: isoOf(base.created),
    context_length: null,
    max_output: null,
    supported_parameters: [],
    reasoning: 'none',
    efforts: [],
    default_effort: null,
    tools: false,
    alias_of: null,
    expires_at: null,
    synced_at: syncedAt,
    gone_at: null,
  };
}

const VIDEO_SECOND = /^cents_per_(?:video_output_)?second(?:_output)?(?:_(\d+p|\dk))?$/;

export function videoPricingOf(model: OrVideoModel): AiPricing {
  const perSecond: Record<string, number> = {};
  let perImage: number | null = null;
  for (const [sku, cents] of Object.entries(model.pricing_skus ?? {})) {
    const match = VIDEO_SECOND.exec(sku);
    if (match !== null) {
      perSecond[match[1] ?? 'any'] = cents / 100;
    } else if (sku === 'cents_per_image_input') {
      perImage = cents / 100;
    }
  }
  const known = Object.keys(perSecond).length > 0;
  return {
    ...NO_PRICES,
    variable: !known,
    per_video_second: known ? perSecond : null,
    per_image_in: perImage,
  };
}

export function videoModelRow(model: OrVideoModel, syncedAt: string): AiModelRow {
  const input = (model.supported_frame_images ?? []).length > 0 ? ['text', 'image'] : ['text'];
  return {
    ...mediaRow(model, syncedAt),
    input_modalities: input,
    output_modalities: ['video'],
    pricing: videoPricingOf(model),
    kinds: ['video'],
  };
}

function imagePriceInto(pricing: AiPricing, price: OrImagePrice): AiPricing {
  const key = `${price.billable}/${price.unit}`;
  switch (key) {
    case 'output_image/image':
      return {
        ...pricing,
        per_image_out: { ...pricing.per_image_out, [price.variant ?? 'any']: price.cost_usd },
      };
    case 'output_image/token':
      return { ...pricing, image_out_per_mtok: perMillion(price.cost_usd) };
    case 'input_image/token':
      return { ...pricing, image_in_per_mtok: perMillion(price.cost_usd) };
    case 'input_image/image':
      return { ...pricing, per_image_in: price.cost_usd };
    case 'input_text/token':
      return { ...pricing, input_per_mtok: perMillion(price.cost_usd) };
    default:
      return { ...pricing, variable: true };
  }
}

export function imageModelRow(
  model: OrImageModel,
  prices: readonly OrImagePrice[],
  syncedAt: string,
): AiModelRow {
  return {
    ...mediaRow(model, syncedAt),
    input_modalities: model.architecture.input_modalities,
    output_modalities: model.architecture.output_modalities,
    pricing: prices.reduce(imagePriceInto, NO_PRICES),
    kinds: ['image'],
  };
}

export function googleModelRow(
  model: GoogleModel,
  pricing: AiPricing,
  syncedAt: string,
  created: string,
): AiModelRow {
  return {
    id: model.id,
    provider: 'google',
    name: model.name,
    author: 'google',
    author_name: 'Google',
    family: `google/${model.family}`,
    description: model.description,
    created,
    context_length: model.contextLength,
    max_output: null,
    input_modalities: [...model.input],
    output_modalities: [...model.output],
    supported_parameters: [],
    reasoning: model.reasoning,
    efforts: [],
    default_effort: null,
    tools: model.kinds.includes('live'),
    alias_of: null,
    pricing,
    kinds: [...model.kinds],
    expires_at: null,
    synced_at: syncedAt,
    gone_at: null,
  };
}
