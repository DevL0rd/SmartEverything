import type { TvConnection } from './connection';

export class ReusedConnection {
  private connection: TvConnection | null = null;
  private connecting: Promise<TvConnection> | null = null;

  constructor(private readonly opener: () => Promise<TvConnection>) {}

  get(): Promise<TvConnection> {
    if (this.connection?.isOpen === true) {
      return Promise.resolve(this.connection);
    }
    this.connecting ??= this.open().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  close(): void {
    this.connection?.close();
    this.connection = null;
  }

  private async open(): Promise<TvConnection> {
    const connection = await this.opener();
    connection.onClose(() => {
      this.connection = null;
    });
    this.connection = connection;
    return connection;
  }
}
