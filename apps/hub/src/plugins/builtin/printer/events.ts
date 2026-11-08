export const JOB_STARTED = {
  kind: 'job_started',
  title: 'A print job started',
  fields: {
    pages: 'number',
    person: 'string',
    job: 'string',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const JOB_FINISHED = {
  kind: 'job_finished',
  title: 'A print job ended',
  fields: {
    result: 'string',
    pages: 'number',
    person: 'string',
    job: 'string',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const PROBLEM_ADDED = {
  kind: 'problem_added',
  title: 'A printer problem began',
  fields: {
    keyword: 'string',
    severity: 'string',
    part: 'string',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const PROBLEM_CLEARED = {
  kind: 'problem_cleared',
  title: 'A printer problem ended',
  fields: { keyword: 'string', part: 'string', printer: 'string', printer_id: 'string' },
} as const;

export const ALERT = {
  kind: 'alert',
  title: 'A printer raised an alert',
  fields: {
    code: 'string',
    group: 'string',
    severity: 'string',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const SUPPLY_LOW = {
  kind: 'supply_low',
  title: 'Ink or toner is low',
  fields: {
    supply: 'string',
    key: 'string',
    level: 'number',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const SUPPLY_EMPTY = {
  kind: 'supply_empty',
  title: 'Ink or toner ran out',
  fields: {
    supply: 'string',
    key: 'string',
    level: 'number',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const SUPPLY_REPLACED = {
  kind: 'supply_replaced',
  title: 'A cartridge was replaced',
  fields: {
    supply: 'string',
    key: 'string',
    level: 'number',
    certain: 'boolean',
    printer: 'string',
    printer_id: 'string',
  },
} as const;

export const RESTARTED = {
  kind: 'restarted',
  title: 'A printer restarted',
  fields: { printer: 'string', printer_id: 'string' },
} as const;

export const CONFIG_CHANGED = {
  kind: 'config_changed',
  title: 'A printer changed its settings',
  fields: { printer: 'string', printer_id: 'string' },
} as const;

export const PAIRING_PROBLEM = {
  kind: 'pairing_problem',
  title: 'A printer connection needs attention',
  fields: { reason: 'string', printer: 'string', printer_id: 'string' },
} as const;

export const OFFLINE_LONG = {
  kind: 'offline_long',
  title: 'A printer has been offline for 30 minutes',
  fields: { printer: 'string', printer_id: 'string' },
} as const;

export const PRINTER_EVENTS = [
  JOB_STARTED,
  JOB_FINISHED,
  PROBLEM_ADDED,
  PROBLEM_CLEARED,
  ALERT,
  SUPPLY_LOW,
  SUPPLY_EMPTY,
  SUPPLY_REPLACED,
  RESTARTED,
  CONFIG_CHANGED,
  PAIRING_PROBLEM,
  OFFLINE_LONG,
] as const;
