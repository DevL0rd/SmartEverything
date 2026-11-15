import { createTransport } from 'nodemailer';
import type { MailConfig } from './settings';
import type { MailMessage } from './message';

const CONNECTION_TIMEOUT_MS = 20_000;
const SOCKET_TIMEOUT_MS = 30_000;

export type MailTransport = (config: MailConfig, message: MailMessage) => Promise<void>;

function addressOf(config: MailConfig): string {
  return config.from_name === null
    ? config.from_address
    : `"${config.from_name.replaceAll('"', '')}" <${config.from_address}>`;
}

export const smtpTransport: MailTransport = async (config, message) => {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'tls',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    ...(config.user === null || config.password === null
      ? {}
      : { auth: { user: config.user, pass: config.password } }),
  });
  try {
    await transport.sendMail({
      from: addressOf(config),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.calendar === null
        ? {}
        : {
            icalEvent: {
              method: message.calendar.method,
              filename: message.calendar.filename,
              content: message.calendar.content,
            },
          }),
    });
  } finally {
    transport.close();
  }
};
