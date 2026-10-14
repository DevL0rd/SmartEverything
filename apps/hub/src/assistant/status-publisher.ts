export class StatusPublisher {
  private publishing = false;
  constructor(private readonly announce: () => void) {}
  publish(): void {
    if (this.publishing) return;
    this.publishing = true;
    queueMicrotask(() => {
      this.publishing = false;
      this.announce();
    });
  }
}
