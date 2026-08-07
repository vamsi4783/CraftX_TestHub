// ─── Baseline Store (Phase 4 M5) ──────────────────────────────────────────────
// Persists baseline images on the filesystem.
// Keys map to files: <baseDir>/<key>.png
// The interface is deliberately minimal so callers aren't coupled to storage.

import fs   from 'fs';
import path from 'path';
import type { BaselineMetadata } from './VisualTypes.js';
import { StructuredLogger }      from '../logging/StructuredLogger.js';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IBaselineStore {
  save(key: string, png: Buffer, meta?: Partial<BaselineMetadata>): Promise<void>;
  load(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  listKeys(prefix?: string): Promise<string[]>;
  loadMeta(key: string): Promise<BaselineMetadata | undefined>;
}

// ─── Filesystem implementation ────────────────────────────────────────────────

export class FileSystemBaselineStore implements IBaselineStore {
  private readonly logger = new StructuredLogger('BaselineStore');

  constructor(private readonly baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  private pngPath(key: string): string {
    return path.join(this.baseDir, `${this._sanitize(key)}.png`);
  }

  private metaPath(key: string): string {
    return path.join(this.baseDir, `${this._sanitize(key)}.json`);
  }

  private _sanitize(key: string): string {
    // Replace path separators so they become folder separators, sanitize rest
    return key.replace(/[^a-zA-Z0-9/_-]/g, '_');
  }

  async save(key: string, png: Buffer, meta?: Partial<BaselineMetadata>): Promise<void> {
    const p = this.pngPath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, png);

    const metaFull: BaselineMetadata = {
      key,
      capturedAt:  new Date().toISOString(),
      width:       0,
      height:      0,
      sizeBytes:   png.byteLength,
      driverKind:  'unknown',
      ...meta,
    };
    fs.writeFileSync(this.metaPath(key), JSON.stringify(metaFull, null, 2));
    this.logger.info('baseline_saved', { key, bytes: png.byteLength });
  }

  async load(key: string): Promise<Buffer> {
    const p = this.pngPath(key);
    if (!fs.existsSync(p)) {
      throw new Error(`Baseline not found: ${key}`);
    }
    return fs.readFileSync(p);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.pngPath(key));
  }

  async delete(key: string): Promise<void> {
    const p = this.pngPath(key);
    if (fs.existsSync(p))   fs.unlinkSync(p);
    const m = this.metaPath(key);
    if (fs.existsSync(m))   fs.unlinkSync(m);
    this.logger.info('baseline_deleted', { key });
  }

  async listKeys(prefix = ''): Promise<string[]> {
    const sanitized = this._sanitize(prefix);
    const dir       = prefix
      ? path.join(this.baseDir, path.dirname(sanitized))
      : this.baseDir;

    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { recursive: true, withFileTypes: false })
      .map(f => String(f))
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace(/\.png$/, '').replace(/\\/g, '/'));
  }

  async loadMeta(key: string): Promise<BaselineMetadata | undefined> {
    const p = this.metaPath(key);
    if (!fs.existsSync(p)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as BaselineMetadata;
    } catch {
      return undefined;
    }
  }
}

// ─── In-memory store (for tests) ─────────────────────────────────────────────

export class InMemoryBaselineStore implements IBaselineStore {
  private readonly images = new Map<string, Buffer>();
  private readonly metas  = new Map<string, BaselineMetadata>();

  async save(key: string, png: Buffer, meta?: Partial<BaselineMetadata>): Promise<void> {
    this.images.set(key, Buffer.from(png));
    this.metas.set(key, {
      key,
      capturedAt:  new Date().toISOString(),
      width:       0,
      height:      0,
      sizeBytes:   png.byteLength,
      driverKind:  'test',
      ...meta,
    });
  }

  async load(key: string): Promise<Buffer> {
    const buf = this.images.get(key);
    if (!buf) throw new Error(`Baseline not found: ${key}`);
    return Buffer.from(buf);
  }

  async exists(key: string): Promise<boolean> {
    return this.images.has(key);
  }

  async delete(key: string): Promise<void> {
    this.images.delete(key);
    this.metas.delete(key);
  }

  async listKeys(prefix = ''): Promise<string[]> {
    return [...this.images.keys()].filter(k => k.startsWith(prefix));
  }

  async loadMeta(key: string): Promise<BaselineMetadata | undefined> {
    return this.metas.get(key);
  }
}
