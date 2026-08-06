// ─── Structured Logger ────────────────────────────────────────────────────────
// All engine components log through this class.
// Emits JSON lines to console.{debug,info,warn,error} — never console.log.
// Phase 6 swaps the sink to an OTel log exporter without touching call sites.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  event_type?: string;
  command_type?: string;
  correlation_id?: string;
  causation_id?: string;
  execution_id?: string;
  duration_ms?: number;
  result?: 'success' | 'failure' | 'rejected';
  error?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  component: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  constructor(private readonly component: string) {}

  debug(message: string, ctx?: LogContext): void { this._emit('debug', message, ctx); }
  info(message: string, ctx?: LogContext): void  { this._emit('info',  message, ctx); }
  warn(message: string, ctx?: LogContext): void  { this._emit('warn',  message, ctx); }
  error(message: string, ctx?: LogContext): void { this._emit('error', message, ctx); }

  private _emit(level: LogLevel, message: string, ctx?: LogContext): void {
    const entry: LogEntry = {
      level,
      component: this.component,
      message,
      timestamp: new Date().toISOString(),
      ...ctx,
    };
    const json = JSON.stringify(entry);
    switch (level) {
      case 'debug': console.debug(json); break;
      case 'info':  console.info(json);  break;
      case 'warn':  console.warn(json);  break;
      case 'error': console.error(json); break;
    }
  }
}
