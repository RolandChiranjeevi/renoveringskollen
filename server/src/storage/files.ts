import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface Detected {
  mimeType: string;
  ext: string;
}

// Filtyp avgörs av filens innehåll, inte av vad webbläsaren påstår.
export function detectFileType(buf: Buffer): Detected | undefined {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  if (buf.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return { mimeType: 'image/heic', ext: 'heic' };
    }
  }
  if (buf.length >= 5 && ascii(0, 5) === '%PDF-') {
    return { mimeType: 'application/pdf', ext: 'pdf' };
  }
  return undefined;
}

export class FileStore {
  constructor(readonly dir: string) {}

  async save(data: Buffer, ext: string): Promise<string> {
    await fs.mkdir(this.dir, { recursive: true });
    const storedName = `${randomUUID()}.${ext}`;
    await fs.writeFile(this.pathFor(storedName), data, { flag: 'wx' });
    return storedName;
  }

  pathFor(storedName: string): string {
    // storedName skapas alltid av oss, men kontrollera ändå att sökvägen stannar i katalogen.
    const full = path.resolve(this.dir, storedName);
    if (path.dirname(full) !== path.resolve(this.dir)) throw new Error('Ogiltigt filnamn');
    return full;
  }

  /** Tar bort filer; saknade filer ignoreras. */
  async remove(storedNames: string[]): Promise<void> {
    await Promise.all(storedNames.map((n) => fs.rm(this.pathFor(n), { force: true })));
  }
}
