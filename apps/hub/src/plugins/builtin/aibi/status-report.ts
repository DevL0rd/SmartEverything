import { type RobotReport } from '@smarteverything/domain';
import { z } from 'zod';

const FIELD = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .optional();

const REPORT = z.object({
  vernum: FIELD,
  vername1: FIELD,
  vername2: FIELD,
  vername3: FIELD,
  vername4: FIELD,
  city: FIELD,
  country: FIELD,
  timezone: FIELD,
  lang: FIELD,
  age: FIELD,
  name: FIELD,
  updateerr: FIELD,
});

const TEXT_MAX = 80;

function bodyValues(body: string, contentType: string): unknown {
  if (contentType.includes('json')) {
    const parsed: unknown = JSON.parse(body);
    return parsed;
  }
  return Object.fromEntries(new URLSearchParams(body));
}

function textOf(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value.slice(0, TEXT_MAX);
}

export function parseStatusReport(body: Buffer, contentType: string): RobotReport | null {
  let values: unknown;
  try {
    values = bodyValues(body.toString('utf8'), contentType.toLowerCase());
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return null;
    }
    throw cause;
  }
  const parsed = REPORT.safeParse(values);
  if (!parsed.success) {
    return null;
  }
  const report = parsed.data;
  return {
    version: textOf(report.vernum),
    firmware: textOf(report.vername1),
    components: [report.vername2, report.vername3, report.vername4].flatMap((part) => {
      const text = textOf(part);
      return text === null ? [] : [text];
    }),
    city: textOf(report.city),
    country: textOf(report.country),
    timezone: textOf(report.timezone),
    language: textOf(report.lang),
    name: textOf(report.name),
    age: textOf(report.age),
    updateError: textOf(report.updateerr),
  };
}

export function reportLine(report: RobotReport): string {
  const parts: [string, string | null][] = [
    ['firmware', report.firmware],
    ['version', report.version],
    ['city', report.city],
    ['country', report.country],
    ['timezone', report.timezone],
    ['language', report.language],
    ['name', report.name],
    ['age', report.age],
    ['update error', report.updateError],
  ];
  return parts
    .filter((part): part is [string, string] => part[1] !== null)
    .map(([label, value]) => `${label}: ${value}`)
    .join(' | ');
}
