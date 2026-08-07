// ─── DiffGenerator Tests ──────────────────────────────────────────────────────

import { describe, it, expect } from '@jest/globals';
import { PNG }                  from 'pngjs';
import { ImageComparator }      from '../../visual/ImageComparator.js';
import { DiffGenerator }        from '../../visual/DiffGenerator.js';
import { WHITE_10x10, BLACK_10x10, solidPng } from './_pngFixtures.js';

const cmp    = new ImageComparator();
const diffGen = new DiffGenerator();

function decodePng(buf: Buffer): PNG { return PNG.sync.read(buf); }

describe('DiffGenerator — diffImage', () => {
  it('returns a valid PNG buffer', () => {
    const raw  = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const { diffImage } = diffGen.generate(raw);
    expect(() => decodePng(diffImage)).not.toThrow();
  });

  it('diff image has same dimensions as baseline', () => {
    const raw    = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const { diffImage } = diffGen.generate(raw);
    const png    = decodePng(diffImage);
    expect(png.width).toBe(10);
    expect(png.height).toBe(10);
  });

  it('diff pixels are red when images differ', () => {
    const raw   = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const { diffImage } = diffGen.generate(raw);
    const png   = decodePng(diffImage);
    // Check top-left pixel
    expect(png.data[0]).toBe(255);   // R
    expect(png.data[1]).toBe(0);     // G
    expect(png.data[2]).toBe(0);     // B
  });

  it('unchanged pixels are dimmed (not full white or black)', () => {
    const raw   = cmp.compare(WHITE_10x10(), WHITE_10x10(), { mode: 'exact' });
    const { diffImage } = diffGen.generate(raw);
    const png   = decodePng(diffImage);
    // Dimmed white: should be somewhere between 100 and 255
    expect(png.data[0]).toBeGreaterThan(100);
    expect(png.data[0]).toBeLessThanOrEqual(255);
  });
});

describe('DiffGenerator — overlayImage', () => {
  it('returns a valid PNG buffer', () => {
    const raw  = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const { overlayImage } = diffGen.generate(raw);
    expect(() => decodePng(overlayImage)).not.toThrow();
  });

  it('overlay is wider than baseline (side-by-side)', () => {
    const raw    = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const { overlayImage } = diffGen.generate(raw);
    const png    = decodePng(overlayImage);
    // width should be 2×baseline + 2 divider pixels
    expect(png.width).toBe(10 * 2 + 2);
    expect(png.height).toBe(10);
  });

  it('divider pixels are reddish', () => {
    const raw    = cmp.compare(WHITE_10x10(), BLACK_10x10(), { mode: 'exact' });
    const { overlayImage } = diffGen.generate(raw);
    const png    = decodePng(overlayImage);
    // Divider starts at x=10 (first divider pixel of row 0)
    const divIdx = (0 * png.width + 10) * 4;
    expect(png.data[divIdx]).toBeGreaterThan(100);    // R is dominant
    expect(png.data[divIdx + 1]).toBeLessThan(100);   // G is low
    expect(png.data[divIdx + 2]).toBeLessThan(100);   // B is low
  });

  it('left half matches baseline pixel values', () => {
    const baseline = solidPng(10, 10, 100, 150, 200);
    const current  = BLACK_10x10();
    const raw      = cmp.compare(baseline, current, { mode: 'exact' });
    const { overlayImage } = diffGen.generate(raw);
    const png      = decodePng(overlayImage);
    // pixel at (0,0) in overlay should be the baseline pixel
    expect(png.data[0]).toBe(100);
    expect(png.data[1]).toBe(150);
    expect(png.data[2]).toBe(200);
  });
});
