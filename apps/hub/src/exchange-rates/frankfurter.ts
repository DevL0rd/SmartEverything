import { CURRENCY_CODE, STORED_CURRENCY } from '@smarteverything/domain';
import { z } from 'zod';
import { fetchJson, type ProviderRequest } from '../outbound/provider-json';

const PROVIDER = 'Frankfurter';

export const FRANKFURTER_URL = `https://api.frankfurter.dev/v1/latest?base=${STORED_CURRENCY}`;

const ANSWER = z.object({
  base: z.literal(STORED_CURRENCY),
  date: z.iso.date(),
  rates: z.record(CURRENCY_CODE, z.number().positive()),
});

export interface FetchedRates {
  readonly rates: Readonly<Record<string, number>>;
  readonly rateDate: string;
}

export async function fetchRates(request: ProviderRequest): Promise<FetchedRates> {
  const answer = await fetchJson(request, PROVIDER, FRANKFURTER_URL, ANSWER);
  return { rates: { ...answer.rates, [STORED_CURRENCY]: 1 }, rateDate: answer.date };
}
