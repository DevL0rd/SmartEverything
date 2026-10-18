const NUMBER = /^(\d+)(\.\d+)?$/;
const MIN_INTEGER_DIGITS = 3;

export function widestOf(value: string): string {
  const match = NUMBER.exec(value);
  if (match === null) {
    return value;
  }
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  return `${'8'.repeat(Math.max(whole.length, MIN_INTEGER_DIGITS))}${fraction.replace(/\d/g, '8')}`;
}
