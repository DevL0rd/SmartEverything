import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Random } from './random.ts';

const execute = promisify(execFile);

export interface Place {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface Shot {
  readonly takenAt: Date;
  readonly place: Place | null;
  readonly make: string;
  readonly model: string;
  readonly width: number;
  readonly height: number;
  readonly hue: number;
}

function exifTime(moment: Date): string {
  const text = moment.toISOString();
  return `${text.slice(0, 4)}:${text.slice(5, 7)}:${text.slice(8, 10)} ${text.slice(11, 19)}`;
}

function rational(value: number): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  const seconds = Math.round(((absolute - degrees) * 60 - minutes) * 60 * 100);
  return `${String(degrees)}/1 ${String(minutes)}/1 ${String(seconds)}/100`;
}

function pictureSvg(shot: Shot, label: string): string {
  const { width, height, hue } = shot;
  const second = (hue + 70) % 360;
  const shapes = Array.from({ length: 5 }, (_, index) => {
    const x = Math.round((((hue * (index + 3) * 37) % 100) / 100) * width);
    const y = Math.round((((second * (index + 5) * 23) % 100) / 100) * height);
    const radius = Math.round(Math.min(width, height) * (0.06 + index * 0.03));
    return `<circle cx="${String(x)}" cy="${String(y)}" r="${String(radius)}" fill="hsl(${String((hue + index * 40) % 360)} 70% 70%)" fill-opacity="0.55"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${String(hue)} 65% 45%)"/><stop offset="1" stop-color="hsl(${String(second)} 70% 65%)"/></linearGradient></defs><rect width="${String(width)}" height="${String(height)}" fill="url(#g)"/>${shapes}<text x="24" y="${String(height - 28)}" font-family="sans-serif" font-size="${String(Math.round(height / 22))}" fill="#fff" fill-opacity="0.8">${label}</text></svg>`;
}

export async function writeFileAt(
  path: string,
  data: Uint8Array | string,
  when: Date,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  await utimes(path, when, when);
}

export async function writeJpeg(path: string, shot: Shot, label: string): Promise<void> {
  const place = shot.place;
  const bytes = await sharp(Buffer.from(pictureSvg(shot, label)))
    .withExif({
      IFD0: { Make: shot.make, Model: shot.model },
      IFD2: { DateTimeOriginal: exifTime(shot.takenAt), OffsetTimeOriginal: '+00:00' },
      ...(place === null
        ? {}
        : {
            IFD3: {
              GPSLatitudeRef: place.latitude >= 0 ? 'N' : 'S',
              GPSLatitude: rational(place.latitude),
              GPSLongitudeRef: place.longitude >= 0 ? 'E' : 'W',
              GPSLongitude: rational(place.longitude),
            },
          }),
    })
    .jpeg({ quality: 82 })
    .toBuffer();
  await writeFileAt(path, bytes, shot.takenAt);
}

export async function writePng(path: string, shot: Shot, label: string, when: Date): Promise<void> {
  const bytes = await sharp(Buffer.from(pictureSvg(shot, label)))
    .png()
    .toBuffer();
  await writeFileAt(path, bytes, when);
}

export function ffmpegBinary(): string {
  const path: unknown = createRequire(import.meta.url)('ffmpeg-static');
  if (typeof path !== 'string') throw new Error('No bundled ffmpeg is available.');
  return path;
}

export async function writeVideo(
  path: string,
  takenAt: Date,
  seconds: number,
  rate: number,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await execute(
    ffmpegBinary(),
    [
      '-y',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=320x240:rate=${String(rate)}:duration=${String(seconds)}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${String(seconds)}`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-metadata',
      `creation_time=${takenAt.toISOString()}`,
      path,
    ],
    { maxBuffer: 16 << 20 },
  );
  await utimes(path, takenAt, takenAt);
}

export function wavTone(seconds: number, frequency: number): Uint8Array {
  const rate = 8000;
  const samples = rate * seconds;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1)
    data.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * index) / rate) * 9000),
      44 + index * 2,
    );
  return data;
}

export function textPdf(title: string, lines: readonly string[]): string {
  const escape = (text: string): string =>
    text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const content = `BT /F1 14 Tf 50 780 Td (${escape(title)}) Tj ${lines
    .map((line) => `0 -20 Td (${escape(line)}) Tj`)
    .join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${String(index + 1)} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return out;
}

export function noise(rng: Random, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += 4) {
    const value = Math.floor(rng.next() * 4294967296);
    for (let index = 0; index < 4 && offset + index < bytes; index += 1)
      out[offset + index] = (value >>> (index * 8)) & 255;
  }
  return out;
}
