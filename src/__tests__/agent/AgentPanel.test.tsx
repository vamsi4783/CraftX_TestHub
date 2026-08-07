// ─── M9: AgentPanel unit tests ───────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentPanel } from '../../features/agent/AgentPanel';

const BASE_PROPS = {
  agentId:         'agent-test-001',
  agentVersion:    '2.3.1',
  protocolVersion: '1.0',
  agentState:      'Running' as const,
  connectionState: 'Connected' as const,
  heartbeatSeq:    7,
  lastHeartbeatAt: null,
};

describe('AgentPanel — renders identity fields', () => {
  it('renders agentId', () => {
    render(<AgentPanel {...BASE_PROPS} />);
    expect(screen.getByText('agent-test-001')).toBeInTheDocument();
  });

  it('renders agentVersion', () => {
    render(<AgentPanel {...BASE_PROPS} />);
    expect(screen.getByText('2.3.1')).toBeInTheDocument();
  });

  it('renders protocolVersion', () => {
    render(<AgentPanel {...BASE_PROPS} />);
    expect(screen.getByText('1.0')).toBeInTheDocument();
  });

  it('renders heartbeat sequence number', () => {
    render(<AgentPanel {...BASE_PROPS} />);
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});

describe('AgentPanel — connection state badge', () => {
  it('shows Connected badge', () => {
    render(<AgentPanel {...BASE_PROPS} connectionState="Connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows Disconnected badge', () => {
    render(<AgentPanel {...BASE_PROPS} connectionState="Disconnected" />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('shows AuthenticationFailed badge', () => {
    render(<AgentPanel {...BASE_PROPS} connectionState="AuthenticationFailed" />);
    expect(screen.getByText('AuthenticationFailed')).toBeInTheDocument();
  });
});

describe('AgentPanel — agent state chip', () => {
  it('shows Running chip', () => {
    render(<AgentPanel {...BASE_PROPS} agentState="Running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows Faulted chip', () => {
    render(<AgentPanel {...BASE_PROPS} agentState="Faulted" />);
    expect(screen.getByText('Faulted')).toBeInTheDocument();
  });
});

describe('AgentPanel — last heartbeat', () => {
  it('shows last heartbeat time when set', () => {
    const ts = new Date('2026-08-07T10:00:00.000Z').toISOString();
    render(<AgentPanel {...BASE_PROPS} lastHeartbeatAt={ts} />);
    expect(screen.getByText(/Last heartbeat:/)).toBeInTheDocument();
  });

  it('hides last heartbeat row when null', () => {
    render(<AgentPanel {...BASE_PROPS} lastHeartbeatAt={null} />);
    expect(screen.queryByText(/Last heartbeat:/)).not.toBeInTheDocument();
  });
});
