// ─── AssertionRegistry ────────────────────────────────────────────────────────
// Pluggable registry of assertion handlers.
// All built-in handlers are pre-registered. Custom handlers can be added.

import type { AssertionKind }     from './AssertionTypes.js';
import type { IAssertionHandler } from './handlers/IAssertionHandler.js';

// Android
import { ActivityAssertionHandler }          from './handlers/android/ActivityAssertionHandler.js';
import { PackageAssertionHandler }           from './handlers/android/PackageAssertionHandler.js';
import { TextAssertionHandler }              from './handlers/android/TextAssertionHandler.js';
import { ViewExistsAssertionHandler }        from './handlers/android/ViewExistsAssertionHandler.js';
import { ScreenshotExistsAssertionHandler }  from './handlers/android/ScreenshotExistsAssertionHandler.js';

// Chrome
import { ElementExistsAssertionHandler }     from './handlers/chrome/ElementExistsAssertionHandler.js';
import { TextExistsAssertionHandler }        from './handlers/chrome/TextExistsAssertionHandler.js';
import { AttributeAssertionHandler }         from './handlers/chrome/AttributeAssertionHandler.js';
import { UrlAssertionHandler }               from './handlers/chrome/UrlAssertionHandler.js';
import { TitleAssertionHandler }             from './handlers/chrome/TitleAssertionHandler.js';

// Common
import { WaitUntilAssertionHandler }         from './handlers/common/WaitUntilAssertionHandler.js';
import { ValueEqualsAssertionHandler }       from './handlers/common/ValueEqualsAssertionHandler.js';
import { RegexMatchAssertionHandler }        from './handlers/common/RegexMatchAssertionHandler.js';

// ─── Registry ─────────────────────────────────────────────────────────────────

export class AssertionRegistry {
  private readonly _handlers = new Map<AssertionKind, IAssertionHandler>();

  constructor() {
    this._registerBuiltins();
  }

  /**
   * Register a custom handler. Overwrites any existing handler for the same kind.
   * Call after construction to add or replace handlers.
   */
  register(handler: IAssertionHandler): void {
    this._handlers.set(handler.kind, handler);
  }

  /**
   * Resolve a handler by kind.
   * @throws {Error} if no handler is registered for the given kind.
   */
  resolve(kind: AssertionKind): IAssertionHandler {
    const handler = this._handlers.get(kind);
    if (!handler) {
      throw new Error(`AssertionRegistry: no handler registered for kind "${kind}"`);
    }
    return handler;
  }

  has(kind: AssertionKind): boolean {
    return this._handlers.has(kind);
  }

  /** Returns all registered handler kinds. */
  list(): AssertionKind[] {
    return [...this._handlers.keys()];
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _registerBuiltins(): void {
    const builtins: IAssertionHandler[] = [
      // Android
      new ActivityAssertionHandler(),
      new PackageAssertionHandler(),
      new TextAssertionHandler(),
      new ViewExistsAssertionHandler(),
      new ScreenshotExistsAssertionHandler(),
      // Chrome
      new ElementExistsAssertionHandler(),
      new TextExistsAssertionHandler(),
      new AttributeAssertionHandler(),
      new UrlAssertionHandler(),
      new TitleAssertionHandler(),
      // Common
      new WaitUntilAssertionHandler(),
      new ValueEqualsAssertionHandler(),
      new RegexMatchAssertionHandler(),
    ];

    for (const h of builtins) {
      this._handlers.set(h.kind, h);
    }
  }
}
