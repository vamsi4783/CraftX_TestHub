/**
 * Config form tests — covers:
 *   GeminiConfigForm, OllamaConfigForm, OpenAICompatConfigForm, MCPConfigForm
 * Key concerns: validation, masked credentials, correct onChange callbacks
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeminiConfigForm }       from '../../features/ai-connectors/GeminiConfigForm';
import { OllamaConfigForm }       from '../../features/ai-connectors/OllamaConfigForm';
import { OpenAICompatConfigForm } from '../../features/ai-connectors/OpenAICompatConfigForm';
import { MCPConfigForm }          from '../../features/ai-connectors/MCPConfigForm';

// ─── Gemini Form ──────────────────────────────────────────────────────────────

describe('GeminiConfigForm — rendering', () => {
  it('renders display name field', () => {
    render(<GeminiConfigForm onChange={vi.fn()} />);
    expect(screen.getByTestId('gemini-display-name')).toBeInTheDocument();
  });

  it('renders API key field as password type', () => {
    render(<GeminiConfigForm onChange={vi.fn()} />);
    const input = screen.getByTestId('gemini-api-key');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('API key field has no autocomplete', () => {
    render(<GeminiConfigForm onChange={vi.fn()} />);
    const input = screen.getByTestId('gemini-api-key');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });

  it('renders model selector', () => {
    render(<GeminiConfigForm onChange={vi.fn()} />);
    expect(screen.getByTestId('gemini-model')).toBeInTheDocument();
  });
});

describe('GeminiConfigForm — validation', () => {
  it('calls onChange with valid=false when API key is empty (no existing key)', () => {
    const onChange = vi.fn();
    render(<GeminiConfigForm onChange={onChange} />);
    // Default state: API key empty → invalid
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: '' }),
      false,
    );
  });

  it('calls onChange with valid=true when name + key are filled', () => {
    const onChange = vi.fn();
    render(<GeminiConfigForm onChange={onChange} />);
    fireEvent.change(screen.getByTestId('gemini-api-key'), { target: { value: 'AIza-test' } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
  });

  it('calls onChange with valid=true when hasExistingKey=true even with empty key field', () => {
    const onChange = vi.fn();
    render(<GeminiConfigForm hasExistingKey onChange={onChange} />);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
  });
});

describe('GeminiConfigForm — secret handling', () => {
  it('typed API key value is never visible as plain text in DOM', () => {
    render(<GeminiConfigForm onChange={vi.fn()} />);
    fireEvent.change(screen.getByTestId('gemini-api-key'), { target: { value: 'AIza-super-secret' } });
    // Type=password means the browser won't render it, but let's verify the input value
    // is stored only in the input element, not leaked to other DOM nodes
    const allText = document.body.textContent ?? '';
    expect(allText).not.toContain('AIza-super-secret');
  });
});

// ─── Ollama Form ──────────────────────────────────────────────────────────────

describe('OllamaConfigForm — rendering', () => {
  it('renders endpoint field', () => {
    render(<OllamaConfigForm onDiscoverModels={vi.fn().mockResolvedValue([])} onChange={vi.fn()} />);
    expect(screen.getByTestId('ollama-endpoint')).toBeInTheDocument();
  });

  it('renders discover button', () => {
    render(<OllamaConfigForm onDiscoverModels={vi.fn().mockResolvedValue([])} onChange={vi.fn()} />);
    expect(screen.getByTestId('ollama-discover-btn')).toBeInTheDocument();
  });

  it('has no password fields (Ollama has no API key)', () => {
    render(<OllamaConfigForm onDiscoverModels={vi.fn().mockResolvedValue([])} onChange={vi.fn()} />);
    const pwFields = screen.queryAllByDisplayValue(/password/i);
    expect(pwFields).toHaveLength(0);
    // More specifically: no input[type=password]
    const allInputs = document.querySelectorAll('input[type="password"]');
    expect(allInputs).toHaveLength(0);
  });
});

describe('OllamaConfigForm — validation', () => {
  it('invalid when endpoint is blank', () => {
    const onChange = vi.fn();
    render(<OllamaConfigForm onDiscoverModels={vi.fn().mockResolvedValue([])} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('ollama-endpoint'), { target: { value: '' } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(false);
  });

  it('valid with default values', () => {
    const onChange = vi.fn();
    render(<OllamaConfigForm onDiscoverModels={vi.fn().mockResolvedValue([])} onChange={onChange} />);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
  });
});

// ─── OpenAI-Compatible Form ───────────────────────────────────────────────────

describe('OpenAICompatConfigForm — rendering', () => {
  it('renders base URL field', () => {
    render(<OpenAICompatConfigForm onChange={vi.fn()} />);
    expect(screen.getByTestId('oai-base-url')).toBeInTheDocument();
  });

  it('renders API key field as password type', () => {
    render(<OpenAICompatConfigForm onChange={vi.fn()} />);
    const input = screen.getByTestId('oai-api-key');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders model field', () => {
    render(<OpenAICompatConfigForm onChange={vi.fn()} />);
    expect(screen.getByTestId('oai-model')).toBeInTheDocument();
  });
});

describe('OpenAICompatConfigForm — validation', () => {
  it('invalid when base URL is blank', () => {
    const onChange = vi.fn();
    render(<OpenAICompatConfigForm onChange={onChange} />);
    // Default state has no baseUrl
    const firstCall = onChange.mock.calls[0];
    expect(firstCall[1]).toBe(false);
  });

  it('valid when name, URL, and model filled', () => {
    const onChange = vi.fn();
    render(<OpenAICompatConfigForm onChange={onChange} />);
    fireEvent.change(screen.getByTestId('oai-base-url'), { target: { value: 'http://api.groq.com/openai/v1' } });
    fireEvent.change(screen.getByTestId('oai-model'),    { target: { value: 'llama3-70b' } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
  });

  it('API key is optional — valid without it', () => {
    const onChange = vi.fn();
    render(<OpenAICompatConfigForm onChange={onChange} />);
    fireEvent.change(screen.getByTestId('oai-base-url'), { target: { value: 'http://localhost:1234/v1' } });
    fireEvent.change(screen.getByTestId('oai-model'),    { target: { value: 'phi-3' } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
    expect(lastCall[0].apiKey).toBe('');  // key is empty — that is OK
  });
});

describe('OpenAICompatConfigForm — secret handling', () => {
  it('API key is never visible as plain text in DOM', () => {
    render(<OpenAICompatConfigForm onChange={vi.fn()} />);
    fireEvent.change(screen.getByTestId('oai-api-key'), { target: { value: 'gsk-should-not-leak' } });
    const allText = document.body.textContent ?? '';
    expect(allText).not.toContain('should-not-leak');
  });
});

// ─── MCP Form ─────────────────────────────────────────────────────────────────

describe('MCPConfigForm — rendering', () => {
  it('renders transport selector', () => {
    render(<MCPConfigForm onChange={vi.fn()} />);
    expect(screen.getByTestId('mcp-transport')).toBeInTheDocument();
  });

  it('shows command field for stdio transport', () => {
    render(<MCPConfigForm onChange={vi.fn()} />);
    // Default transport is stdio
    expect(screen.getByTestId('mcp-command')).toBeInTheDocument();
  });

  it('has no password fields (MCP has no API key in this form)', () => {
    render(<MCPConfigForm onChange={vi.fn()} />);
    const allPwInputs = document.querySelectorAll('input[type="password"]');
    expect(allPwInputs).toHaveLength(0);
  });
});

describe('MCPConfigForm — validation', () => {
  it('invalid when display name is empty', () => {
    const onChange = vi.fn();
    render(<MCPConfigForm onChange={onChange} />);
    fireEvent.change(screen.getByTestId('mcp-display-name'), { target: { value: '' } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(false);
  });

  it('valid with default values (stdio + command)', () => {
    const onChange = vi.fn();
    render(<MCPConfigForm
      initial={{ mcpCommand: 'npx my-server', mcpTransport: 'stdio', displayName: 'Test MCP' }}
      onChange={onChange}
    />);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[1]).toBe(true);
  });
});
