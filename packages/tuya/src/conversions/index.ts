import type { ReportedValue } from '../model';
import { NULL_HANDLING_GENERAL, NULL_PRESERVING_GENERAL } from './general';
import { NULL_HANDLING_LIGHTING, NULL_PRESERVING_LIGHTING } from './lighting';
import { METERING } from './metering';
import { ConversionError, type ConversionConfig, type Converter } from './primitives';

export { ConversionError } from './primitives';

export const IDENTITY_CONVERSION = 'default';

export interface DataPointConversion extends ConversionConfig {
  readonly name: string;
  readonly dpId: number;
}

export interface ConvertedReport {
  readonly report: readonly ReportedValue[];
  readonly unknownDpIds: readonly number[];
  readonly problems: readonly { readonly dpId: number; readonly error: ConversionError }[];
}

const NULL_PRESERVING: ReadonlyMap<string, Converter> = new Map(
  Object.entries({ ...NULL_PRESERVING_LIGHTING, ...METERING, ...NULL_PRESERVING_GENERAL }),
);

const NULL_HANDLING: ReadonlyMap<string, Converter> = new Map(
  Object.entries({ ...NULL_HANDLING_LIGHTING, ...NULL_HANDLING_GENERAL }),
);

export function isKnownConversion(name: string): boolean {
  return NULL_PRESERVING.has(name) || NULL_HANDLING.has(name);
}

export function convertValue(conversion: DataPointConversion, raw: unknown): unknown {
  const handling = NULL_HANDLING.get(conversion.name);
  if (handling !== undefined) {
    return handling(raw, conversion);
  }
  const preserving = NULL_PRESERVING.get(conversion.name);
  if (preserving === undefined) {
    throw new ConversionError(conversion.name, 'the conversion is unknown');
  }
  return raw === null || raw === undefined ? null : preserving(raw, conversion);
}

export function convertDataPoints(
  conversions: ReadonlyMap<number, DataPointConversion>,
  dps: Readonly<Record<string, unknown>>,
): ConvertedReport {
  const report: ReportedValue[] = [];
  const unknownDpIds: number[] = [];
  const problems: { dpId: number; error: ConversionError }[] = [];
  for (const [field, raw] of Object.entries(dps)) {
    const dpId = Number(field);
    const conversion = conversions.get(dpId);
    if (conversion === undefined) {
      unknownDpIds.push(dpId);
      continue;
    }
    try {
      report.push({ code: conversion.code, value: convertValue(conversion, raw) });
    } catch (error) {
      if (!(error instanceof ConversionError)) {
        throw error;
      }
      problems.push({ dpId, error });
    }
  }
  return { report, unknownDpIds, problems };
}
