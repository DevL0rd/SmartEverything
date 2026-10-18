const dates = new Map<string, Intl.DateTimeFormat>();
const numbers = new Map<string, Intl.NumberFormat>();
const collators = new Map<string, Intl.Collator>();

export function dateFormat(
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): Intl.DateTimeFormat {
  const key = JSON.stringify([locale, options]);
  const known = dates.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = new Intl.DateTimeFormat(locale, options);
  dates.set(key, made);
  return made;
}

export function zonedDateFormat(
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): (timeZone: string | null) => Intl.DateTimeFormat {
  const byZone = new Map<string | null, Intl.DateTimeFormat>();
  return (timeZone) => {
    const known = byZone.get(timeZone);
    if (known !== undefined) {
      return known;
    }
    const made = new Intl.DateTimeFormat(
      locale,
      timeZone === null ? options : { ...options, timeZone },
    );
    byZone.set(timeZone, made);
    return made;
  };
}

export function numberFormat(options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = JSON.stringify(options);
  const known = numbers.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = new Intl.NumberFormat(undefined, options);
  numbers.set(key, made);
  return made;
}

export function collator(options: Intl.CollatorOptions = {}): Intl.Collator {
  const key = JSON.stringify(options);
  const known = collators.get(key);
  if (known !== undefined) {
    return known;
  }
  const made = new Intl.Collator(undefined, options);
  collators.set(key, made);
  return made;
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
};
const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: 'numeric', second: 'numeric' };

export function dateTimeText(at: Date | number): string {
  return dateFormat(DATE_TIME).format(at);
}

export function timeText(at: Date | number): string {
  return dateFormat(TIME).format(at);
}
