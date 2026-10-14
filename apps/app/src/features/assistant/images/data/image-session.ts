let generation = 0;

export function imageSessionScope(): number {
  return generation;
}

export function clearImageSession(): void {
  generation += 1;
}
