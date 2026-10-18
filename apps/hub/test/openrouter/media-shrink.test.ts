import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import { OpenRouterClient } from '../../src/openrouter/client';
import { OpenRouterMediaNotes } from '../../src/openrouter/media-notes';
import { OpenRouterTranscription } from '../../src/openrouter/transcription';

const run = promisify(execFile);
const SAMPLE_RATE = 16_000;

function wavOf(seconds: number): Buffer {
  const samples = SAMPLE_RATE * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1)
    data.writeInt16LE(Math.round(8000 * Math.sin(index / 12)), index * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function clipOf(): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'smarteverything-clip-'));
  try {
    const target = join(directory, 'clip.mp4');
    await run(ffmpegPath(), [
      ...['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=10:duration=2'],
      ...['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-y', target],
    ]);
    return await readFile(target);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function sent(): { readonly client: OpenRouterClient; readonly bodies: () => string[] } {
  const bodies: string[] = [];
  const client = new OpenRouterClient({
    key: (): string => 'k',
    fetch: (_url, init): Promise<Response> => {
      bodies.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve(
        Response.json({
          text: 'spoken words',
          id: 'gen-1',
          choices: [{ message: { content: 'a clip' } }],
        }),
      );
    },
  });
  return { client, bodies: (): string[] => bodies };
}

describe('long media shrinks before one OpenRouter request', () => {
  it('sends audio over the request limit as shrunk speech', async () => {
    const audio = wavOf(2);
    const { client, bodies } = sent();

    const answer = await new OpenRouterTranscription(client, audio.byteLength / 2).transcribe({
      model: 'm',
      data: audio,
      format: 'wav',
    });

    expect(answer.text).toBe('spoken words');
    const [body] = bodies();
    expect(JSON.parse(body ?? '{}')).toMatchObject({ input_audio: { format: 'ogg' } });
    expect(Buffer.byteLength(body ?? '')).toBeLessThan(audio.byteLength);
  });

  it('sends audio under the request limit untouched', async () => {
    const audio = wavOf(1);
    const { client, bodies } = sent();

    await new OpenRouterTranscription(client, audio.byteLength).transcribe({
      model: 'm',
      data: audio,
      format: 'wav',
    });

    expect(JSON.parse(bodies()[0] ?? '{}')).toMatchObject({
      input_audio: { format: 'wav', data: audio.toString('base64') },
    });
  });

  it('refuses audio that is still over the limit once shrunk', async () => {
    const { client, bodies } = sent();

    await expect(
      new OpenRouterTranscription(client, 100).transcribe({
        model: 'm',
        data: wavOf(2),
        format: 'wav',
      }),
    ).rejects.toThrow('audio is too long to transcribe in one request');
    expect(bodies()).toHaveLength(0);
  });

  it('describes a video over the request limit from its shrunk copy', async () => {
    const clip = await clipOf();
    const { client, bodies } = sent();

    const answer = await new OpenRouterMediaNotes(client, clip.byteLength / 2).describe({
      model: 'm',
      prompt: 'p',
      mime: 'video/mp4',
      data: clip,
    });

    expect(answer.text).toBe('a clip');
    const [body] = bodies();
    expect(Buffer.byteLength(body ?? '')).toBeLessThan(clip.byteLength);
    expect(body).toContain('data:video/mp4;base64,');
  });

  it('refuses media that is still over the limit once shrunk', async () => {
    const clip = await clipOf();
    const { client, bodies } = sent();

    await expect(
      new OpenRouterMediaNotes(client, 100).describe({
        model: 'm',
        prompt: 'p',
        mime: 'video/mp4',
        data: clip,
      }),
    ).rejects.toThrow('caption media is too large to describe in one request');
    expect(bodies()).toHaveLength(0);
  });
});
