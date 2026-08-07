// ─── MessageSerializer ────────────────────────────────────────────────────────
// Serialize → JSON string; parse → AgentMessage.
// Validates required BaseMessage fields on parse; does not validate payloads.

import type { AgentMessage } from './MessageProtocol.js';

export class MessageParseError extends Error {
  constructor(detail: string, public readonly raw?: string) {
    super(`MessageParseError: ${detail}`);
    this.name = 'MessageParseError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const REQUIRED_FIELDS: ReadonlyArray<string> = [
  'messageId',
  'correlationId',
  'timestamp',
  'protocolVersion',
  'type',
];

const KNOWN_TYPES = new Set<string>([
  'Command', 'Event', 'Heartbeat', 'Response', 'Error',
  'AuthHandshake', 'AuthResult',
]);

export class MessageSerializer {
  /** Serialize an AgentMessage to a JSON string. */
  serialize(msg: AgentMessage): string {
    return JSON.stringify(msg);
  }

  /**
   * Parse a raw JSON string into an AgentMessage.
   * Throws MessageParseError on malformed JSON, missing fields, or unknown type.
   */
  parse(raw: string): AgentMessage {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new MessageParseError(
        `Invalid JSON: ${raw.slice(0, 120)}`,
        raw,
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new MessageParseError('Message must be a JSON object', raw);
    }

    const obj = parsed as Record<string, unknown>;

    for (const field of REQUIRED_FIELDS) {
      if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
        throw new MessageParseError(`Missing required field: "${field}"`, raw);
      }
    }

    const type = obj['type'] as string;
    if (!KNOWN_TYPES.has(type)) {
      throw new MessageParseError(`Unknown message type: "${type}"`, raw);
    }

    return obj as unknown as AgentMessage;
  }
}
