import { Box, Typography, Tabs, Tab, Divider } from '@mui/material';
import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { useAgentStore } from './agentStore';
import { AgentPanel } from './AgentPanel';
import { DeviceExplorer } from './DeviceExplorer';
import { ExecutionConsole } from './ExecutionConsole';
import { EventTimeline } from './EventTimeline';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { HealthDashboard } from './HealthDashboard';
import { CommandConsole } from './CommandConsole';
import { EvidenceProgressView } from './EvidenceProgressView';
import { ConnectionSettings } from './ConnectionSettings';

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export function AgentPage() {
  const [tab, setTab] = useState(0);

  const {
    agentId, agentVersion, protocolVersion, agentState, connectionState,
    heartbeatSeq, lastHeartbeatAt, health, devices, diagnostics,
    evidenceItems, events, settings,
    clearEvents, updateSettings,
    executeTest, cancelExecution, refreshDiagnostics, refreshDevices,
  } = useAgentStore();

  return (
    <Box>
      <PageHeader
        title="Agent Runtime"
        subtitle="Monitor and control the test execution agent."
      />

      <AgentPanel
        agentId={agentId}
        agentVersion={agentVersion}
        protocolVersion={protocolVersion}
        agentState={agentState}
        connectionState={connectionState}
        heartbeatSeq={heartbeatSeq}
        lastHeartbeatAt={lastHeartbeatAt}
      />

      <Divider sx={{ my: 2 }} />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab label="Health" />
        <Tab label="Devices" />
        <Tab label="Console" />
        <Tab label="Events" />
        <Tab label="Diagnostics" />
        <Tab label="Commands" />
        <Tab label="Evidence" />
        <Tab label="Settings" />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <HealthDashboard health={health} />
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <DeviceExplorer devices={devices} />
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <ExecutionConsole events={events} onClear={clearEvents} />
      </TabPanel>

      <TabPanel value={tab} index={3}>
        <EventTimeline events={events} />
      </TabPanel>

      <TabPanel value={tab} index={4}>
        <DiagnosticsPanel health={health} diagnostics={diagnostics} />
      </TabPanel>

      <TabPanel value={tab} index={5}>
        <CommandConsole
          onExecuteTest={executeTest}
          onCancelExecution={cancelExecution}
          onRefreshDiagnostics={refreshDiagnostics}
          onRefreshDevices={refreshDevices}
        />
      </TabPanel>

      <TabPanel value={tab} index={6}>
        <EvidenceProgressView items={evidenceItems} />
      </TabPanel>

      <TabPanel value={tab} index={7}>
        <ConnectionSettings settings={settings} onSave={updateSettings} />
      </TabPanel>

      {tab > 7 && (
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary">Select a tab above.</Typography>
        </Box>
      )}
    </Box>
  );
}
