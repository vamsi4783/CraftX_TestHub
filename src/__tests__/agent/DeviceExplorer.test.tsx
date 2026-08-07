// ─── M9: DeviceExplorer unit tests ───────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceExplorer } from '../../features/agent/DeviceExplorer';
import type { AgentDevice } from '../../features/agent/AgentTypes';

function makeDevice(overrides: Partial<AgentDevice> = {}): AgentDevice {
  return {
    deviceId:        'dev-001',
    kind:            'android',
    label:           'Pixel 7',
    availability:    'available',
    registeredAt:    new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('DeviceExplorer — empty state', () => {
  it('shows empty message when no devices', () => {
    render(<DeviceExplorer devices={[]} />);
    expect(screen.getByText('No devices registered.')).toBeInTheDocument();
  });

  it('shows count chip as 0', () => {
    render(<DeviceExplorer devices={[]} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

describe('DeviceExplorer — with devices', () => {
  it('renders device label', () => {
    render(<DeviceExplorer devices={[makeDevice({ label: 'Pixel 7' })]} />);
    expect(screen.getByText('Pixel 7')).toBeInTheDocument();
  });

  it('renders device ID', () => {
    render(<DeviceExplorer devices={[makeDevice({ deviceId: 'dev-abc-123' })]} />);
    expect(screen.getByText('dev-abc-123')).toBeInTheDocument();
  });

  it('renders availability chip', () => {
    render(<DeviceExplorer devices={[makeDevice({ availability: 'busy' })]} />);
    expect(screen.getByText('busy')).toBeInTheDocument();
  });

  it('renders multiple devices', () => {
    render(<DeviceExplorer devices={[
      makeDevice({ deviceId: 'd1', label: 'Device 1' }),
      makeDevice({ deviceId: 'd2', label: 'Device 2', kind: 'browser' }),
    ]} />);
    expect(screen.getByText('Device 1')).toBeInTheDocument();
    expect(screen.getByText('Device 2')).toBeInTheDocument();
  });

  it('shows count chip with device count', () => {
    render(<DeviceExplorer devices={[makeDevice(), makeDevice({ deviceId: 'd2', label: 'D2' })]} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
