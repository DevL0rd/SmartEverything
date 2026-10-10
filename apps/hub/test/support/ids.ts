let counter = 0;

export function nextId(): string {
  counter += 1;
  return `c0000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}
