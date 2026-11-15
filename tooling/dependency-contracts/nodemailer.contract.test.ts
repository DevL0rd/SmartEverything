import nodemailer, { type Transporter } from 'nodemailer';
import type StreamTransport from 'nodemailer/lib/stream-transport';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

const CANCEL = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:CANCEL\r\nEND:VCALENDAR';

const stream = (): Transporter<StreamTransport.SentMessageInfo, StreamTransport.Options> =>
  nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });

function rawOf(message: unknown): string {
  return Buffer.isBuffer(message) ? message.toString() : '';
}

describe('nodemailer contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, 'nodemailer')).toBe(installedVersion('nodemailer'));
  });

  it('builds a transport and reports the envelope of the recipients it would send to', async () => {
    const info = await stream().sendMail({
      from: 'Home <home@example.com>',
      to: 'Sam <sam@example.com>, kim@example.com',
      subject: 'Invitation: Dinner',
      text: 'plain',
      html: '<p>html</p>',
    });
    expect(info.envelope).toEqual({
      from: 'home@example.com',
      to: ['sam@example.com', 'kim@example.com'],
    });
  });

  it('encodes a non-ASCII subject so mail apps decode it', async () => {
    const info = await stream().sendMail({
      from: 'home@example.com',
      to: 'sam@example.com',
      subject: 'Einladung: Mittagessen ünï',
      text: 'x',
    });
    expect(rawOf(info.message)).toContain(
      'Subject: =?UTF-8?Q?Einladung=3A_Mittagessen_=C3=BCn=C3=AF?=',
    );
  });

  it('attaches an iTIP part with its METHOD so a mail app shows an invitation', async () => {
    const info = await stream().sendMail({
      from: 'home@example.com',
      to: 'sam@example.com',
      subject: 'Cancelled',
      text: 'x',
      icalEvent: { method: 'CANCEL', filename: 'cancel.ics', content: CANCEL },
    });
    const raw = rawOf(info.message);
    expect(raw).toContain('Content-Type: text/calendar; charset=utf-8; method=CANCEL');
    expect(raw).toContain('Content-Disposition: attachment; filename=cancel.ics');
  });

  it('serialises a message to JSON for a transport that sends nothing', async () => {
    const info = await nodemailer
      .createTransport({ jsonTransport: true })
      .sendMail({ from: 'home@example.com', to: 'sam@example.com', subject: 'Hi', text: 'x' });
    expect(JSON.parse(info.message)).toMatchObject({ subject: 'Hi', text: 'x' });
  });

  it('does not refuse a message with no recipient, so the caller must check the list itself', async () => {
    const info = await stream().sendMail({
      from: 'home@example.com',
      to: '',
      subject: 's',
      text: 'x',
    });
    expect(info.envelope.to).toEqual([]);
  });

  it('fails with a socket code when the SMTP server is not there', async () => {
    const closed = nodemailer.createTransport({
      host: '127.0.0.1',
      port: 9,
      secure: false,
      connectionTimeout: 1000,
    });
    await expect(
      closed.sendMail({ from: 'home@example.com', to: 'sam@example.com', subject: 's', text: 'x' }),
    ).rejects.toMatchObject({ code: 'ESOCKET' });
  });
});
