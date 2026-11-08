import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING } from './primitives';
import { IR_APPLIANCE } from './endpoints-ir-appliances';
import { REMOTE_NAME } from './rows-media';

export const IR_LIBRARY_SOURCES = ['smartir', 'flipper-irdb'] as const;

export const IR_LIBRARY_KINDS = ['climate', 'keys'] as const;

const COUNT_OF_MODELS = z.int().min(0).describe('How many models it holds');

export const IR_LIBRARY_CATEGORY = z.strictObject({
  category: z.string().min(1).describe('The appliance category, such as Air conditioner or TV'),
  models: COUNT_OF_MODELS,
});

export type IrLibraryCategory = z.infer<typeof IR_LIBRARY_CATEGORY>;

export const IR_LIBRARY_BRAND = z.strictObject({
  brand: z.string().min(1).describe('The brand name'),
  models: COUNT_OF_MODELS,
});

export type IrLibraryBrand = z.infer<typeof IR_LIBRARY_BRAND>;

export const IR_LIBRARY_MODEL = z.strictObject({
  id: z.string().min(1).describe('The library id that createIrApplianceFromLibrary takes'),
  source: z.enum(IR_LIBRARY_SOURCES),
  kind: z
    .enum(IR_LIBRARY_KINDS)
    .describe('climate sets state in one frame (mode, temperature, fan); keys sends one button'),
  category: z.string().min(1),
  brand: z.string().min(1),
  models: z.array(z.string().min(1)).min(1).describe('The remote models this entry covers'),
  buttons: z.array(z.string().min(1)).describe('The buttons of a keys entry; empty for climate'),
});

export type IrLibraryModel = z.infer<typeof IR_LIBRARY_MODEL>;

const CATEGORY_QUERY = z.strictObject({ category: z.string().min(1) });

export const IR_LIBRARY_ENDPOINTS = {
  listIrLibraryCategories: endpoint({
    method: 'GET',
    path: '/api/ir-library',
    access: 'member',
    summary:
      'The appliance categories of the built-in infrared library (open SmartIR and Flipper-IRDB codes), each with how many models it holds',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(IR_LIBRARY_CATEGORY),
  }),
  listIrLibraryBrands: endpoint({
    method: 'GET',
    path: '/api/ir-library/brands',
    access: 'member',
    summary: 'The brands the infrared library has in one category',
    params: NOTHING,
    query: CATEGORY_QUERY,
    body: NO_BODY,
    response: z.array(IR_LIBRARY_BRAND),
  }),
  listIrLibraryModels: endpoint({
    method: 'GET',
    path: '/api/ir-library/models',
    access: 'member',
    summary: 'The remote models the infrared library has for one brand in one category',
    params: NOTHING,
    query: CATEGORY_QUERY.extend({ brand: z.string().min(1) }),
    body: NO_BODY,
    response: z.array(IR_LIBRARY_MODEL),
  }),
  createIrApplianceFromLibrary: endpoint({
    method: 'POST',
    path: '/api/ir-library/appliances',
    access: 'member',
    summary:
      'Add an infrared appliance from a library model: it becomes its own device sent through the chosen IR blaster, with the library codes and no learning',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      library_id: z.string().min(1),
      blaster_id: ID,
      name: REMOTE_NAME,
      room_id: ID.optional().describe('The room to put it in; the blaster room when left out'),
    }),
    response: IR_APPLIANCE,
  }),
} as const;
