// ─── Health Monitor Event Payload Types ──────────────────────────────────────

export interface ConnectedDevice {
  driver_id: string;         // "android_adb" | "chrome_cdp"
  device_serial: string;     // ADB serial | "chrome:9222"
  device_model: string;
  os_version: string;
  status: 'ready' | 'busy' | 'error';
}

export interface AgentHeartbeatPayload {
  // Agent identity
  agent_version: string;
  agent_id: string;
  uptime_seconds: number;

  // Connectivity
  connected_to_supabase: boolean;
  ws_clients_connected: number;

  // Runtime resources
  cpu_percent: number;       // process CPU 0–100
  memory_used_mb: number;    // process RSS
  memory_total_mb: number;   // OS total

  // Execution load
  active_executions: number;
  queue_depth: number;       // evidence upload queue depth
  completed_today: number;   // sessions completed in current UTC day

  // Connected devices
  connected_devices: ConnectedDevice[];
}
