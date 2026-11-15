import { createServer, type Server, type Socket } from 'node:net';

export interface FakeMail {
  readonly from: string;
  readonly to: readonly string[];
  readonly data: string;
  readonly user: string | null;
}

export interface FakeSmtpOptions {
  readonly auth?: { readonly user: string; readonly password: string };
  readonly refuseRecipient?: (address: string) => boolean;
}

export interface FakeSmtp {
  readonly port: number;
  readonly mails: readonly FakeMail[];
  readonly connections: () => number;
  readonly close: () => Promise<void>;
}

interface Session {
  from: string;
  to: string[];
  user: string | null;
  data: string[] | null;
  login: 'user' | 'password' | null;
  pendingUser: string;
}

function addressOf(argument: string): string {
  const match = /<([^>]*)>/.exec(argument);
  return (match?.[1] ?? argument).trim();
}

function decoded(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function plainCredentials(value: string): { user: string; password: string } {
  const [, user = '', password = ''] = decoded(value).split('\u0000');
  return { user, password };
}

class Conversation {
  private readonly session: Session = {
    from: '',
    to: [],
    user: null,
    data: null,
    login: null,
    pendingUser: '',
  };
  private buffer = '';

  constructor(
    private readonly socket: Socket,
    private readonly options: FakeSmtpOptions,
    private readonly mails: FakeMail[],
  ) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    socket.on('error', () => undefined);
    this.reply('220 fake.smtp ready');
  }

  private reply(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  private drain(): void {
    for (;;) {
      const end = this.buffer.indexOf('\r\n');
      if (end < 0) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      this.line(line);
    }
  }

  private line(line: string): void {
    const { session } = this;
    if (session.data !== null) {
      this.dataLine(line);
      return;
    }
    if (session.login !== null) {
      this.loginLine(line);
      return;
    }
    this.command(line);
  }

  private dataLine(line: string): void {
    const { session } = this;
    if (line === '.') {
      this.mails.push({
        from: session.from,
        to: [...session.to],
        data: (session.data ?? []).join('\r\n'),
        user: session.user,
      });
      session.data = null;
      session.to = [];
      this.reply('250 queued');
      return;
    }
    session.data?.push(line.startsWith('..') ? line.slice(1) : line);
  }

  private loginLine(line: string): void {
    const { session } = this;
    if (session.login === 'user') {
      session.pendingUser = decoded(line);
      session.login = 'password';
      this.reply(`334 ${Buffer.from('Password:').toString('base64')}`);
      return;
    }
    session.login = null;
    this.authenticate(session.pendingUser, decoded(line));
  }

  private authenticate(user: string, password: string): void {
    const expected = this.options.auth;
    if (expected === undefined || (expected.user === user && expected.password === password)) {
      this.session.user = user;
      this.reply('235 authenticated');
    } else {
      this.reply('535 bad credentials');
    }
  }

  private command(line: string): void {
    const verb = line.split(' ', 1)[0]?.toUpperCase() ?? '';
    const argument = line.slice(verb.length).trim();
    const handlers: Readonly<Record<string, () => void>> = {
      EHLO: () => {
        this.hello();
      },
      HELO: () => {
        this.hello();
      },
      AUTH: () => {
        this.auth(argument);
      },
      MAIL: () => {
        this.mailFrom(argument);
      },
      RCPT: () => {
        this.rcpt(argument);
      },
      DATA: () => {
        this.data();
      },
      RSET: () => {
        this.reset();
      },
      QUIT: () => {
        this.quit();
      },
    };
    (
      handlers[verb] ??
      ((): void => {
        this.reply('250 ok');
      })
    )();
  }

  private hello(): void {
    this.socket.write(
      `250-fake.smtp\r\n${this.options.auth === undefined ? '' : '250-AUTH PLAIN LOGIN\r\n'}250 8BITMIME\r\n`,
    );
  }

  private auth(argument: string): void {
    const [mechanism = '', initial = ''] = argument.split(' ');
    if (mechanism.toUpperCase() === 'PLAIN' && initial !== '') {
      const { user, password } = plainCredentials(initial);
      this.authenticate(user, password);
    } else if (mechanism.toUpperCase() === 'LOGIN') {
      this.session.login = 'user';
      this.reply(`334 ${Buffer.from('Username:').toString('base64')}`);
    } else {
      this.reply('504 unsupported');
    }
  }

  private mailFrom(argument: string): void {
    if (this.options.auth !== undefined && this.session.user === null) {
      this.reply('530 authentication required');
      return;
    }
    this.session.from = addressOf(argument);
    this.reply('250 ok');
  }

  private rcpt(argument: string): void {
    const address = addressOf(argument);
    if (this.options.refuseRecipient?.(address) === true) {
      this.reply(`550 no such user <${address}>`);
      return;
    }
    this.session.to.push(address);
    this.reply('250 ok');
  }

  private data(): void {
    this.session.data = [];
    this.reply('354 go ahead');
  }

  private reset(): void {
    this.session.to = [];
    this.session.data = null;
    this.reply('250 ok');
  }

  private quit(): void {
    this.reply('221 bye');
    this.socket.end();
  }
}

export async function startFakeSmtp(options: FakeSmtpOptions = {}): Promise<FakeSmtp> {
  const mails: FakeMail[] = [];
  const sockets = new Set<Socket>();
  let opened = 0;
  const server: Server = createServer((socket) => {
    opened += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    new Conversation(socket, options, mails);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The fake SMTP server is not listening on a port.');
  }
  return {
    port: address.port,
    mails,
    connections: () => opened,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}
