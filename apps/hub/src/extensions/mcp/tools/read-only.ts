import { z } from 'zod';
import type { Tool, ToolContext } from './registry';

const SELECTORS = ['action', 'view'] as const;

const VARIANT_HINTS = z.looseObject({
  annotations: z.looseObject({ readOnlyHint: z.boolean() }),
});

function selectedVariant(tool: Tool, args: Readonly<Record<string, unknown>>): unknown {
  for (const selector of SELECTORS) {
    const value = args[selector];
    if (typeof value === 'string' && tool.variants?.has(value) === true) {
      return tool.variants.get(value);
    }
  }
  return undefined;
}

export function readsOnly(tool: Tool, args: Readonly<Record<string, unknown>>): boolean {
  if (tool.listing.annotations.readOnlyHint) {
    return true;
  }
  const variant = VARIANT_HINTS.safeParse(selectedVariant(tool, args));
  return variant.success && variant.data.annotations.readOnlyHint;
}

export function readOnlyCaller(context: Pick<ToolContext, 'caller'>): boolean {
  return context.caller?.readOnly === true;
}

export function readOnlyRefusal(tool: Tool): string {
  return `This connection is read only, so ${tool.name} cannot change anything; the owner can make a connection that may change things in SmartEverything under Settings › AI assistants.`;
}
