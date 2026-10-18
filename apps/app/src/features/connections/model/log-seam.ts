function endsAt(tail: readonly string[], live: readonly string[], end: number): boolean {
  const length = Math.min(tail.length, end);
  for (let offset = 1; offset <= length; offset += 1) {
    if (live[end - offset] !== tail[tail.length - offset]) {
      return false;
    }
  }
  return true;
}

export function joinLogLines(tail: readonly string[], live: readonly string[]): readonly string[] {
  if (tail.length === 0) {
    return live;
  }
  for (let end = live.length; end > 0; end -= 1) {
    if (endsAt(tail, live, end)) {
      return [...tail, ...live.slice(end)];
    }
  }
  return [...tail, ...live];
}
