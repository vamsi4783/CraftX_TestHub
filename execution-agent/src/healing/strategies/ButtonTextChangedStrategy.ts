// ─── ButtonTextChangedStrategy (Phase 4 M7) ───────────────────────────────────
// When a button's visible text changes slightly (casing, punctuation,
// whitespace, synonym), produce text-based fallback locators.

import type { IDriver }       from '../../drivers/IDriver.js';
import type { ExecutionStep } from '../../execution/ExecutionTypes.js';
import type { HealingCapability, LocatorCandidate } from '../HealingTypes.js';
import type { IHealingStrategy }                   from './IHealingStrategy.js';

const CAPABILITY: HealingCapability = {
  kind:      'button_text_changed',
  retryCost: 2,
  priority:  2,
};

// Common label synonyms: { canonical → [alternatives] }
const SYNONYMS: Record<string, string[]> = {
  'login':    ['sign in', 'log in', 'signin'],
  'sign in':  ['login', 'log in', 'signin'],
  'register': ['sign up', 'create account', 'signup'],
  'sign up':  ['register', 'create account', 'signup'],
  'ok':       ['okay', 'confirm', 'done', 'accept'],
  'cancel':   ['dismiss', 'close', 'back'],
  'submit':   ['send', 'confirm', 'save', 'apply'],
  'save':     ['apply', 'update', 'confirm'],
  'delete':   ['remove', 'erase'],
  'next':     ['continue', 'proceed', 'forward'],
  'back':     ['previous', 'prev', 'go back'],
  'search':   ['find', 'look up', 'query'],
};

export class ButtonTextChangedStrategy implements IHealingStrategy {
  readonly kind       = 'button_text_changed' as const;
  readonly capability = CAPABILITY;

  canHandle(step: ExecutionStep, _error: string): boolean {
    const sel = step.action.selector ?? '';
    // Applicable when selector is plain text (no special characters typical of xpath/css)
    return sel.length > 0 && !sel.startsWith('/') && !sel.startsWith('#')
      && !sel.startsWith('.') && !sel.includes('[') && !sel.includes(':');
  }

  async getCandidates(
    step:    ExecutionStep,
    _driver: IDriver,
    _error:  string,
  ): Promise<LocatorCandidate[]> {
    const text      = step.action.selector ?? '';
    const lower     = text.toLowerCase().trim();
    const candidates: LocatorCandidate[] = [];

    // ── A: case normalization ─────────────────────────────────────────────────
    const variants = [
      text.toUpperCase(),
      text.toLowerCase(),
      text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
    ].filter(v => v !== text);

    for (const variant of variants) {
      candidates.push({
        locator:     { strategy: 'text', value: variant },
        confidence:  0.7,
        explanation: `Case variant: "${variant}"`,
        strategy:    this.kind,
      });
    }

    // ── B: whitespace collapse ────────────────────────────────────────────────
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed !== text) {
      candidates.push({
        locator:     { strategy: 'text', value: collapsed },
        confidence:  0.75,
        explanation: `Whitespace-collapsed: "${collapsed}"`,
        strategy:    this.kind,
      });
    }

    // ── C: contains partial match via xpath ───────────────────────────────────
    const words = lower.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const longestWord = words.reduce((a, b) => (a.length >= b.length ? a : b));
      candidates.push({
        locator:     { strategy: 'xpath', value: `//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${longestWord}')]` },
        confidence:  0.5,
        explanation: `XPath contains (case-insensitive) "${longestWord}"`,
        strategy:    this.kind,
      });
    }

    // ── D: synonym lookup ─────────────────────────────────────────────────────
    const synonyms = SYNONYMS[lower] ?? [];
    for (const syn of synonyms) {
      candidates.push({
        locator:     { strategy: 'text', value: syn },
        confidence:  0.55,
        explanation: `Known synonym: "${syn}" for "${lower}"`,
        strategy:    this.kind,
      });
      // Also try title-cased synonym
      const titled = syn.charAt(0).toUpperCase() + syn.slice(1);
      candidates.push({
        locator:     { strategy: 'text', value: titled },
        confidence:  0.5,
        explanation: `Title-cased synonym: "${titled}"`,
        strategy:    this.kind,
      });
    }

    // ── E: strip punctuation ──────────────────────────────────────────────────
    const noPunct = text.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    if (noPunct !== text && noPunct.length > 0) {
      candidates.push({
        locator:     { strategy: 'text', value: noPunct },
        confidence:  0.6,
        explanation: `Punctuation stripped: "${noPunct}"`,
        strategy:    this.kind,
      });
    }

    return candidates;
  }
}
