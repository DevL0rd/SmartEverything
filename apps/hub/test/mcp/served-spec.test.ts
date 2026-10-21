import { MCP_ROUTES, MCP_TOOLS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { TOOLS } from '../../src/extensions/mcp/tools';
import { SHARED_SCHEMAS, sharedSchemaNamed } from '../../src/extensions/mcp/tools/shared-schemas';

const PARAMETER_TEXT_MAX = 480;
const LISTING_MAX = 11_000;
const FULL_LISTING_MAX = 210_000;
const SELECTORS: ReadonlySet<string> = new Set(['action', 'view']);

const HINTS = z.strictObject({
  title: z.string().min(1),
  readOnlyHint: z.boolean(),
  destructiveHint: z.boolean(),
  idempotentHint: z.boolean(),
  openWorldHint: z.boolean(),
});

const VARIANT = z.looseObject({ annotations: HINTS });

function parameterTexts(schema: unknown, path: string): readonly (readonly [string, string])[] {
  if (typeof schema !== 'object' || schema === null) {
    return [];
  }
  return Object.entries(schema).flatMap(([key, value]) => {
    const here = `${path}.${key}`;
    const own: (readonly [string, string])[] =
      key === 'description' && typeof value === 'string' ? [[path, value]] : [];
    return [...own, ...parameterTexts(value, here)];
  });
}

function selectorPath(path: string): boolean {
  return [...SELECTORS].some((selector) => path === `.properties.${selector}`);
}

const SELECTOR = z.looseObject({
  properties: z.record(z.string(), z.looseObject({ enum: z.array(z.unknown()).optional() })),
});

describe('the served listings', () => {
  it('offer exactly the branch keys as the selector values of every routed tool', () => {
    for (const [name, route] of MCP_ROUTES) {
      if (!('branches' in route)) continue;
      const listing = TOOLS.find((tool) => tool.name === name)?.listing.inputSchema;
      const values = SELECTOR.parse(listing).properties[route.key]?.enum;
      expect(values, name).toStrictEqual(Object.keys(route.branches));
    }
  });

  it('carry all four annotation hints on every tool and every variant', () => {
    for (const tool of TOOLS) {
      expect(HINTS.safeParse(tool.listing.annotations).success, tool.name).toBe(true);
      for (const [value, variant] of tool.variants ?? []) {
        expect(VARIANT.safeParse(variant).success, `${tool.name} ${value}`).toBe(true);
      }
    }
  });

  it('mark a tool destructive and open world when any of its variants is', () => {
    for (const tool of TOOLS) {
      const variants = [...(tool.variants?.values() ?? [])].map(
        (variant) => VARIANT.parse(variant).annotations,
      );
      if (variants.some((hints) => hints.destructiveHint)) {
        expect(tool.listing.annotations.destructiveHint, tool.name).toBe(true);
      }
      if (variants.some((hints) => hints.openWorldHint)) {
        expect(tool.listing.annotations.openWorldHint, tool.name).toBe(true);
      }
    }
  });

  it('mark the tools that reach people, phones or the web as open world', () => {
    const open = ['phone_control', 'voice_speak', 'call_start', 'person_notify', 'browser_control'];
    for (const name of open) {
      expect(
        TOOLS.find((tool) => tool.name === name)?.listing.annotations.openWorldHint,
        name,
      ).toBe(true);
    }
    const close = TOOLS.find((tool) => tool.name === 'computer_app_control')?.variants?.get(
      'close',
    );
    expect(VARIANT.parse(close).annotations.destructiveHint).toBe(true);
  });

  it('mark a tool read only exactly when the registry says it reads, in every variant', () => {
    for (const tool of TOOLS) {
      const access = MCP_TOOLS.find((entry) => entry.name === tool.name)?.access;
      expect(tool.listing.annotations.readOnlyHint, tool.name).toBe(access === 'read');
      for (const [value, variant] of tool.variants ?? []) {
        const hints = VARIANT.parse(variant).annotations;
        expect(hints.title, `${tool.name} ${value}`).toBe(tool.listing.title);
        if (access === 'read') {
          expect(hints.readOnlyHint, `${tool.name} ${value}`).toBe(true);
        }
      }
    }
  });

  it('describe every parameter, in the listing and in every variant', () => {
    const DESCRIBED = z.looseObject({
      properties: z
        .record(z.string(), z.looseObject({ description: z.string().min(3) }))
        .optional(),
    });
    for (const tool of TOOLS) {
      expect(DESCRIBED.safeParse(tool.listing.inputSchema).success, tool.name).toBe(true);
      for (const [value, variant] of tool.variants ?? []) {
        const schema = z.looseObject({ inputSchema: z.unknown() }).parse(variant).inputSchema;
        expect(DESCRIBED.safeParse(schema).success, `${tool.name} ${value}`).toBe(true);
      }
    }
  });

  it('keep parameter descriptions short; the selector lists one line per value', () => {
    for (const tool of TOOLS) {
      for (const [path, text] of parameterTexts(tool.listing.inputSchema, '')) {
        if (!selectorPath(path)) {
          expect(text.length, `${tool.name}${path}`).toBeLessThanOrEqual(PARAMETER_TEXT_MAX);
        }
      }
    }
  });

  it('advertise every shared schema once, through tool_read, and inline none of them', () => {
    const listings = JSON.stringify(TOOLS.map((tool) => tool.listing));
    const variants = JSON.stringify(TOOLS.map((tool) => [...(tool.variants?.values() ?? [])]));
    for (const shared of SHARED_SCHEMAS) {
      expect(listings + variants, shared.name).toContain(`tool_read with name ${shared.name}`);
      const full = z
        .looseObject({ properties: z.unknown().optional() })
        .parse(sharedSchemaNamed(shared.name));
      if (full.properties !== undefined) {
        expect(listings + variants, shared.name).not.toContain(JSON.stringify(full.properties));
      }
    }
    for (const tool of TOOLS) {
      expect(JSON.stringify(tool.listing).length, tool.name).toBeLessThanOrEqual(LISTING_MAX);
    }
    expect(listings.length).toBeLessThanOrEqual(FULL_LISTING_MAX);
  });
});
