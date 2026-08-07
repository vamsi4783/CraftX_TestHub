// ─── M9: ConnectionStatusBadge unit tests ────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatusBadge } from '../../features/agent/ConnectionStatusBadge';
import type { ConnectionState } from '../../features/agent/AgentTypes';

function renderBadge(state: ConnectionState) {
  return render(<ConnectionStatusBadge state={state} />);
}

describe('ConnectionStatusBadge — rendering', () => {
  it('renders Connected label', () => {
    renderBadge('Connected');
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders Disconnected label', () => {
    renderBadge('Disconnected');
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders Connecting label', () => {
    renderBadge('Connecting');
    expect(screen.getByText('Connecting')).toBeInTheDocument();
  });

  it('renders Reconnecting label', () => {
    renderBadge('Reconnecting');
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  it('renders AuthenticationFailed label', () => {
    renderBadge('AuthenticationFailed');
    expect(screen.getByText('AuthenticationFailed')).toBeInTheDocument();
  });
});
