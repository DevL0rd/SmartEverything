import { PLACES, SETTINGS_ROW, placeLabel, type PlaceMatch } from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { READS, ToolError, WRITES, defineTool, type Tool, type ToolContext } from './registry';

const QUERY = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .describe('A town or city name, optionally with its country');

async function search(context: ToolContext, query: string, count: number): Promise<PlaceMatch[]> {
  return PLACES.parse(await operate(context, 'searchPlaces', { query: { q: query, count } }))
    .places;
}

function described(place: PlaceMatch): Record<string, unknown> {
  return { ...place, label: placeLabel(place) };
}

export const PLACE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'search_places',
    input: z.strictObject({
      query: QUERY,
      count: z.int().min(1).max(10).default(5).describe('How many matches to return'),
    }),
    annotations: { ...READS, openWorldHint: true },
    run: async (context, input) => ({
      structured: { places: (await search(context, input.query, input.count)).map(described) },
    }),
  }),
  defineTool({
    name: 'set_home_location_by_name',
    input: z.strictObject({
      query: QUERY,
      choice: z
        .int()
        .min(0)
        .max(9)
        .default(0)
        .describe('Which match from search_places to use, 0 for the best'),
      setTimeZone: z
        .boolean()
        .default(true)
        .describe('Also set the home’s time zone to the place’s'),
    }),
    annotations: { ...WRITES, idempotentHint: true, openWorldHint: true },
    run: async (context, input) => {
      const place = (await search(context, input.query, input.choice + 1))[input.choice];
      if (place === undefined) {
        throw new ToolError(`No place matched “${input.query}”.`, 'not_found');
      }
      const zone =
        input.setTimeZone && place.timeZone !== null ? { time_zone: place.timeZone } : {};
      const settings = SETTINGS_ROW.parse(
        await operate(context, 'updateHome', {
          body: {
            latitude: place.latitude,
            longitude: place.longitude,
            location_name: placeLabel(place),
            ...zone,
          },
        }),
      );
      return {
        structured: {
          place: described(place),
          home: {
            location_name: settings.location_name,
            time_zone: settings.time_zone,
          },
        },
      };
    },
  }),
];
