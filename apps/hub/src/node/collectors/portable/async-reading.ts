export class AsyncReading<T> {
  private latest: { readonly value: T } | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly load: () => Promise<T>,
    private readonly failed: (cause: unknown) => void,
  ) {}

  read(): { readonly value: T } | null {
    if (this.loading === null) {
      this.prime().catch((cause: unknown) => {
        this.failed(cause);
      });
    }
    return this.latest;
  }

  prime(): Promise<void> {
    this.loading ??= this.load()
      .then((value) => {
        this.latest = { value };
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
}
