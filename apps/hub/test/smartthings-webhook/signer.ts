import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

const SHA256_WITH_RSA = Buffer.from('06092a864886f70d01010b0500', 'hex');

const COMMON_NAME = Buffer.from('0603550403', 'hex');

function lengthOf(size: number): Buffer {
  if (size < 0x80) {
    return Buffer.from([size]);
  }
  const bytes: number[] = [];
  for (let rest = size; rest > 0; rest >>= 8) {
    bytes.unshift(rest & 0xff);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, ...content: readonly Buffer[]): Buffer {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), lengthOf(body.length), body]);
}

function nameOf(commonName: string): Buffer {
  return tlv(0x30, tlv(0x31, tlv(0x30, COMMON_NAME, tlv(0x0c, Buffer.from(commonName)))));
}

function certificateFor(keys: { publicKey: KeyObject; privateKey: KeyObject }): string {
  const algorithm = tlv(0x30, SHA256_WITH_RSA);
  const name = nameOf('key.smartthings.test');
  const tbs = tlv(
    0x30,
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(0x02, Buffer.from([1])),
    algorithm,
    name,
    tlv(0x30, tlv(0x17, Buffer.from('250101000000Z')), tlv(0x18, Buffer.from('20991231000000Z'))),
    name,
    keys.publicKey.export({ type: 'spki', format: 'der' }),
  );
  const signature = sign('sha256', tbs, keys.privateKey);
  const der = tlv(0x30, tbs, algorithm, tlv(0x03, Buffer.from([0]), signature));
  const lines = der.toString('base64').match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

export const KEY_ID = '/pl/useast2/test-key-1';

export class WebhookSigner {
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly certificate = certificateFor(this.keys);

  headers(
    body: string,
    options: { readonly path?: string; readonly date?: Date; readonly digestOf?: string } = {},
  ): Record<string, string> {
    const date = (options.date ?? new Date()).toUTCString();
    const digest = `SHA-256=${createHash('sha256')
      .update(options.digestOf ?? body)
      .digest('base64')}`;
    const signed = `(request-target): post ${options.path ?? '/smartthings/webhook'}\ndigest: ${digest}\ndate: ${date}`;
    const signature = sign('sha256', Buffer.from(signed), this.keys.privateKey).toString('base64');
    return {
      'content-type': 'application/json',
      date,
      digest,
      authorization: `Signature keyId="${KEY_ID}",signature="${signature}",headers="(request-target) digest date",algorithm="rsa-sha256"`,
    };
  }
}
