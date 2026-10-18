export class ListEdits {
  private held: readonly string[] | null = null;
  private flights = 0;

  begin(
    server: readonly string[],
    change: (items: readonly string[]) => readonly string[],
  ): readonly string[] {
    const next = change(this.held ?? server);
    this.held = next;
    this.flights += 1;
    return next;
  }

  land(): void {
    this.flights -= 1;
  }

  fail(): void {
    this.flights -= 1;
    this.held = null;
  }

  catchUp(): boolean {
    if (this.flights > 0 || this.held === null) {
      return false;
    }
    this.held = null;
    return true;
  }
}

export function withToggled(items: readonly string[], id: string): readonly string[] {
  return items.includes(id) ? items.filter((other) => other !== id) : [...items, id];
}

export function without(items: readonly string[], id: string): readonly string[] {
  return items.filter((other) => other !== id);
}
