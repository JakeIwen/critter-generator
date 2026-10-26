import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { PORTRAIT_KINDS, portraitFilename, portraitVersionOf } from '../shared/specimen-assets.mjs';

export const MAX_PORTRAIT_BYTES = 30 * 1024 * 1024;
export const MAX_PORTRAIT_PIXELS = 32_000_000;
export const MAX_PORTRAIT_DIMENSION = 16_384;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function inputFormat(bytes) {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function normalizePortrait(input) {
  const bytes = Buffer.isBuffer(input) ? input : input instanceof Uint8Array ? Buffer.from(input) : null;
  if (!bytes?.length || bytes.length > MAX_PORTRAIT_BYTES) throw new Error('Portrait image is empty or exceeds 30 MiB.');
  if (!inputFormat(bytes)) throw new Error('Portrait must be a PNG, JPEG or WebP image.');
  try {
    const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PORTRAIT_PIXELS });
    const metadata = await decoder.metadata();
    if ((metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height ||
      metadata.width > MAX_PORTRAIT_DIMENSION || metadata.height > MAX_PORTRAIT_DIMENSION) {
      throw new Error('Portrait dimensions or animation are not supported.');
    }
    const { data, info } = await decoder.autoOrient().toColourspace('srgb').png().toBuffer({ resolveWithObject: true });
    if (data.length > MAX_PORTRAIT_BYTES) throw new Error('Normalized portrait exceeds 30 MiB.');
    return { bytes: data, width: info.width, height: info.height, format: 'png' };
  } catch (error) {
    throw new Error('Portrait image could not be decoded safely.', { cause: error });
  }
}

function writePortraitAsset(file, bytes) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}

function legacyPortraitEntry(specimen, currentFile) {
  let width = null, height = null;
  const bytes = readFileSync(currentFile);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  }
  return { version: portraitVersionOf(specimen), createdAt: specimen.createdAt,
    kind: PORTRAIT_KINDS.GENERATION, instructions: null, jobId: null, width, height,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}

export function publishPortrait(store, specimen, normalized, options = {}) {
  const kind = options.kind ?? (specimen.image ? PORTRAIT_KINDS.REGENERATE : PORTRAIT_KINDS.GENERATION);
  if (!Object.values(PORTRAIT_KINDS).includes(kind)) throw new Error('Invalid portrait kind.');
  const current = portraitVersionOf(specimen), version = current + 1;
  const legacyFile = store.file('specimens', specimen.id, 'portrait.png');
  const portraits = [...(specimen.portraits ?? [])];
  if (current) {
    const archived = store.file('specimens', specimen.id, portraitFilename(current));
    if (!existsSync(archived) && existsSync(legacyFile)) writePortraitAsset(archived, readFileSync(legacyFile));
    if (existsSync(archived) && !portraits.some(item => item.version === current)) {
      portraits.push(legacyPortraitEntry(specimen, archived));
    }
  }
  const createdAt = options.createdAt ?? new Date().toISOString();
  const portrait = { version, createdAt, kind, instructions: options.instructions ?? null,
    jobId: options.jobId ?? null, width: normalized.width, height: normalized.height,
    sha256: createHash('sha256').update(normalized.bytes).digest('hex') };
  writePortraitAsset(store.file('specimens', specimen.id, portraitFilename(version)), normalized.bytes);
  writePortraitAsset(legacyFile, normalized.bytes);
  return { ...specimen, image: true, imageError: null, portraitVersion: version,
    portraits: [...portraits, portrait], ...(specimen.print ? { print: { ...specimen.print, stale: true } } : {}) };
}
