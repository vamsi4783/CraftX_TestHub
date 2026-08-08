import { describe, it, expect } from 'vitest';
import { SecretScanner } from '../../services/projectIngestion/SecretScanner.js';

const scanner = new SecretScanner();

describe('SecretScanner', () => {
  describe('isSensitivePath', () => {
    it('flags .env files', () => {
      expect(scanner.isSensitivePath('.env')).toBe(true);
      expect(scanner.isSensitivePath('.env.production')).toBe(true);
      expect(scanner.isSensitivePath('config/.env.local')).toBe(true);
    });
    it('flags secrets.json', () => {
      expect(scanner.isSensitivePath('secrets.json')).toBe(true);
      expect(scanner.isSensitivePath('credentials.yaml')).toBe(true);
    });
    it('flags keystore files', () => {
      expect(scanner.isSensitivePath('release.keystore.jks')).toBe(true);
      expect(scanner.isSensitivePath('cert.pem')).toBe(true);
      expect(scanner.isSensitivePath('privateKey.key')).toBe(true);
    });
    it('flags google-services.json', () => {
      expect(scanner.isSensitivePath('google-services.json')).toBe(true);
      expect(scanner.isSensitivePath('GoogleService-Info.plist')).toBe(true);
    });
    it('flags service account files', () => {
      expect(scanner.isSensitivePath('service-account.json')).toBe(true);
      expect(scanner.isSensitivePath('service-account-key.json')).toBe(true);
    });
    it('does not flag normal source files', () => {
      expect(scanner.isSensitivePath('MainActivity.kt')).toBe(false);
      expect(scanner.isSensitivePath('index.ts')).toBe(false);
      expect(scanner.isSensitivePath('package.json')).toBe(false);
    });
  });

  describe('scan', () => {
    it('detects AWS access key', () => {
      const content = 'const key = "AKIAIOSFODNN7EXAMPLE"';
      const findings = scanner.scan(content, 'config.ts');
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toContain('AWS');
    });
    it('detects GitHub PAT classic', () => {
      const content = 'token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
      const findings = scanner.scan(content, 'config.ts');
      expect(findings.length).toBeGreaterThan(0);
    });
    it('detects OpenAI key', () => {
      const content = 'openai_key = "sk-' + 'a'.repeat(48) + '"';
      const findings = scanner.scan(content, 'env.ts');
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toContain('OpenAI');
    });
    it('detects .env-style assignment', () => {
      const content = 'DATABASE_PASSWORD=super_secret_value_here\n';
      const findings = scanner.scan(content, '.env');
      expect(findings.length).toBeGreaterThan(0);
    });
    it('detects PEM private key', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK...\n-----END RSA PRIVATE KEY-----';
      const findings = scanner.scan(content, 'cert.pem');
      expect(findings.length).toBeGreaterThan(0);
    });
    it('returns empty for clean content', () => {
      const content = 'export function add(a: number, b: number) { return a + b; }';
      const findings = scanner.scan(content, 'math.ts');
      expect(findings).toHaveLength(0);
    });
    it('never returns the raw secret — only redacted preview', () => {
      const rawKey = 'AKIAIOSFODNN7EXAMPLE';
      const content = `const key = "${rawKey}"`;
      const findings = scanner.scan(content, 'config.ts');
      for (const f of findings) {
        expect(f.preview).not.toBe(rawKey);
        expect(f.preview).toContain('[REDACTED]');
      }
    });
    it('caps findings at 20 per file', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `AKIA${'X'.repeat(16)}_${i}`).join('\n');
      const findings = scanner.scan(lines, 'keys.ts');
      expect(findings.length).toBeLessThanOrEqual(20);
    });
  });

  describe('shouldExcludeFromAI', () => {
    it('excludes sensitive paths', () => {
      expect(scanner.shouldExcludeFromAI('.env')).toBe(true);
    });
    it('excludes files with detected secrets', () => {
      const content = 'OPENAI_KEY="sk-' + 'z'.repeat(48) + '"';
      expect(scanner.shouldExcludeFromAI('config.ts', content)).toBe(true);
    });
    it('allows clean files', () => {
      expect(scanner.shouldExcludeFromAI('utils.ts', 'export const add = (a, b) => a + b')).toBe(false);
    });
  });
});
