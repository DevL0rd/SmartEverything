const dates = new Map<string, Intl.DateTimeFormat>();
const numbers = new Map<string, Intl.NumberFormat>();

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
