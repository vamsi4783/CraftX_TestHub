// ─── M10: SecretScanner — detect credentials/secrets in file content ──────────
// Run this BEFORE any content is sent to an AI model.
// Files that match are marked isSensitive and excluded from AI context.
// Secrets are NEVER logged, stored, or sent anywhere.

import type { SecretFinding } from './types.js';

// ─── Secret patterns ──────────────────────────────────────────────────────────

interface SecretPattern {
  type:    string;
  pattern: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // Cloud provider keys
  { type: 'AWS Access Key',          pattern: /AKIA[0-9A-Z]{16}/g },
  { type: 'AWS Secret Key',          pattern: /aws[_\-\s]?secret[_\-\s]?access[_\-\s]?key[\s]*[:=][\s]*["']?[A-Za-z0-9/+=]{40}/gi },
  // API keys (generic patterns)
  { type: 'Generic API Key',         pattern: /(?:api[_\-]?key|apikey|api_secret)[^\S\r\n]*[:=][^\S\r\n]*["']?[A-Za-z0-9_\-]{16,}/gi },
  { type: 'Generic Secret',          pattern: /(?:secret|password|passwd|pwd)[^\S\r\n]*[:=][^\S\r\n]*["'][^"']{8,}["']/gi },
  { type: 'Generic Token',           pattern: /(?:token|auth_token|access_token)[^\S\r\n]*[:=][^\S\r\n]*["'][A-Za-z0-9_\-\.]{16,}["']/gi },
  // Well-known service formats
  { type: 'GitHub PAT (classic)',    pattern: /ghp_[a-zA-Z0-9]{36}/g },
  { type: 'GitHub PAT (fine-grained)',pattern: /github_pat_[a-zA-Z0-9_]{82}/g },
  { type: 'GitHub OAuth token',      pattern: /gho_[a-zA-Z0-9]{36}/g },
  { type: 'OpenAI API Key',          pattern: /sk-[a-zA-Z0-9]{48}/g },
  { type: 'Anthropic API Key',       pattern: /sk-ant-[a-zA-Z0-9_\-]{16,}/g },
  { type: 'Stripe Secret Key',       pattern: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g },
  { type: 'Stripe Publishable Key',  pattern: /pk_(?:live|test)_[a-zA-Z0-9]{24,}/g },
  { type: 'Twilio Account SID',      pattern: /AC[a-fA-F0-9]{32}/g },
  { type: 'Twilio Auth Token',       pattern: /SK[a-fA-F0-9]{32}/g },
  { type: 'Supabase Service Key',    pattern: /sbp_[a-zA-Z0-9]{40}/g },
  { type: 'Firebase API Key',        pattern: /AIza[0-9A-Za-z\-_]{35}/g },
  // PEM-encoded keys
  { type: 'RSA Private Key',         pattern: /-----BEGIN RSA PRIVATE KEY-----/g },
  { type: 'EC Private Key',          pattern: /-----BEGIN EC PRIVATE KEY-----/g },
  { type: 'Private Key',             pattern: /-----BEGIN PRIVATE KEY-----/g },
  { type: 'OpenSSH Private Key',     pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g },
  { type: 'PGP Private Key',         pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g },
  // Connection strings
  { type: 'Database URL',            pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/gi },
  { type: 'JDBC URL with password',  pattern: /jdbc:[a-z]+:\/\/[^\s]+password=[^\s&;]+/gi },
  // .env style assignments
  { type: '.env credential',         pattern: /^[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|APIKEY|AUTH)=["']?[^\s"']{8,}/gm },
];

// Files that are almost certainly secrets even without content scanning
const SENSITIVE_FILENAME_PATTERNS = [
  /\.env$/i,
  /\.env\.\w+$/i,
  /secrets?\.(json|yaml|yml|toml|properties)$/i,
  /credentials?\.(json|yaml|yml|toml|properties)$/i,
  /keystore\.(jks|p12|pfx)$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /google-services\.json$/i,
  /GoogleService-Info\.plist$/i,
  /firebase\.json$/i,
  /service-account.*\.json$/i,
  /private.*key.*\.json$/i,
];

// ─── SecretScanner ────────────────────────────────────────────────────────────

export class SecretScanner {

  /** Returns true if the filename alone indicates a secrets file. */
  isSensitivePath(filePath: string): boolean {
    const name = filePath.replace(/^.*[\\/]/, '');
    return SENSITIVE_FILENAME_PATTERNS.some(p => p.test(name));
  }

  /**
   * Scan file content for secret patterns.
   * Returns an array of findings (may be empty).
   * NEVER returns the actual secret value — only a redacted preview.
   */
  scan(content: string, filePath: string): SecretFinding[] {
    const findings: SecretFinding[] = [];

    for (const { type, pattern } of SECRET_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const raw   = match[0];
        const preview = this._redact(raw);
        const line  = this._lineNumber(content, match.index);
        findings.push({ type, pattern: pattern.source, line, preview });
        // Limit findings per file to avoid quadratic scanning on degenerate input
        if (findings.length >= 20) return findings;
      }
    }

    return findings;
  }

  /** Quick boolean check — true if any secret is detected. */
  isSensitiveContent(content: string): boolean {
    for (const { pattern } of SECRET_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      if (re.test(content)) return true;
    }
    return false;
  }

  /** True if the file should be excluded from AI context entirely. */
  shouldExcludeFromAI(filePath: string, content?: string): boolean {
    if (this.isSensitivePath(filePath)) return true;
    if (content && this.isSensitiveContent(content)) return true;
    return false;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _redact(raw: string): string {
    if (raw.length <= 8) return '[REDACTED]';
    const prefix = raw.slice(0, 4);
    const suffix = raw.slice(-3);
    return `${prefix}...[REDACTED]...${suffix}`;
  }

  private _lineNumber(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
  }
}

export const secretScanner = new SecretScanner();
