import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizePortrait, MAX_PORTRAIT_BYTES, MAX_PORTRAIT_DIMENSION } from '../server/portrait-assets.mjs';

const image = () => sharp({ create: { width: 4, height: 3, channels: 4, background: { r: 120, g: 45, b: 200, alpha: .5 } } });

test('normalization fully decodes PNG, JPEG and WebP and stores real PNG pixels and dimensions', async () => {
  for (const format of ['png', 'jpeg', 'webp']) {
    const original = await image()[format]().toBuffer();
    const result = await normalizePortrait(original);
    assert.equal(result.format, 'png');
    assert.equal(result.width, 4);
    assert.equal(result.height, 3);
    const metadata = await sharp(result.bytes).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 4);
    assert.equal(metadata.height, 3);
    const expected = await sharp(original).ensureAlpha().raw().toBuffer();
    const actual = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
    assert.deepEqual(actual, expected, `Decoded ${format} pixels survive normalization`);
  }
});

test('normalization preserves transparency and rejects corrupt, truncated and unsupported image data', async () => {
  const valid = await image().png().toBuffer();
  const normalized = await normalizePortrait(valid);
  const { data, info } = await sharp(normalized.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data[3], 128);
  const paddedHeader = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(160)]);
  await assert.rejects(normalizePortrait(paddedHeader), /could not be decoded/);
  await assert.rejects(normalizePortrait(valid.subarray(0, 40)), /could not be decoded/);
  await assert.rejects(normalizePortrait(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /PNG, JPEG or WebP/);
  await assert.rejects(normalizePortrait(Buffer.alloc(MAX_PORTRAIT_BYTES + 1)), /exceeds 30 MiB/);
  await assert.rejects(normalizePortrait(Buffer.alloc(0)), /empty/);
});

test('normalization rejects excessive dimensions and decompressed pixel count before publication', async () => {
  const tooWide = await sharp({ create: { width: MAX_PORTRAIT_DIMENSION + 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(normalizePortrait(tooWide), /could not be decoded/);
  const tooManyPixels = await sharp({ create: { width: 8000, height: 4001, channels: 3, background: 'red' } }).png().toBuffer();
  await assert.rejects(normalizePortrait(tooManyPixels), /could not be decoded/);
});
