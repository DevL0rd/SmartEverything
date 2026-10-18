const PART_CHARS = 1500;

export function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function exchangeSource(person: string, reply: string): string {
  return `Person: ${cut(person, PART_CHARS)}\nAI: ${cut(reply, PART_CHARS)}`;
}
