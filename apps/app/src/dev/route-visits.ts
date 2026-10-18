export class RouteVisits {
  private readonly spent = new Map<string, number>();
  private since: number;

  constructor(
    private route: string,
    now: number,
  ) {
    this.since = now;
  }

  get current(): string {
    return this.route;
  }

  enter(route: string, now: number): void {
    if (route === this.route) {
      return;
    }
    this.close(now);
    this.route = route;
  }

  take(now: number): string {
    this.close(now);
    const visited = [...this.spent]
      .map(([route, ms]) => `${route}:${String(Math.round(ms / 100) / 10)}`)
      .join(',');
    this.spent.clear();
    return visited;
  }

  private close(now: number): void {
    this.spent.set(this.route, (this.spent.get(this.route) ?? 0) + Math.max(0, now - this.since));
    this.since = now;
  }
}
