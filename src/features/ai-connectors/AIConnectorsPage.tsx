import { useState } from 'react';
import {
  Box, Button, Typography, MenuItem, FormControl, InputLabel, Select,
  Alert, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { ConnectorCard } from './ConnectorCard';
import { AddConnectorDialog } from './AddConnectorDialog';
import { DiagnosticsDialog } from './DiagnosticsDialog';
import { FeatureReadinessPanel } from './FeatureReadinessPanel';
import { useAIConnectors } from './useAIConnectors';
import type { PersistedConnector } from './aiConnectorStore';

export function AIConnectorsPage() {
  const {
    connectors, defaultConnectorId, reload,
    setEnabled, setPriority, setDefault, remove,
    testConnection, getDiagnostics, hasApiKey,
  } = useAIConnectors();

  const [addOpen,  setAddOpen]  = useState(false);
  const [diagConnector, setDiagConnector] = useState<PersistedConnector | null>(null);

  function handleToggleDefault(id: string) {
    if (defaultConnectorId === id) {
      setDefault(undefined);
    } else {
      setDefault(id);
    }
  }

  return (
    <Box>
      <PageHeader
        title="AI Connectors"
        subtitle="Configure and manage AI providers used by TestHub features."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setAddOpen(true)}
            data-testid="add-connector-btn"
          >
            Add Connector
          </Button>
        }
      />

      {/* Default connector selector */}
      {connectors.length > 0 && (
        <Box mb={3} display="flex" alignItems="center" gap={2}>
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>Default Connector</InputLabel>
            <Select
              label="Default Connector"
              value={defaultConnectorId ?? ''}
              onChange={e => setDefault(e.target.value || undefined)}
              data-testid="default-connector-select"
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {connectors.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.displayName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            The default connector is preferred when no routing rule selects another.
          </Typography>
        </Box>
      )}

      {/* Connector list */}
      {connectors.length === 0 ? (
        <EmptyState
          icon={SmartToyIcon}
          title="No AI connectors configured"
          description="Add a connector to start using AI-powered features."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>
              Add your first connector
            </Button>
          }
        />
      ) : (
        <Box display="flex" flexDirection="column" gap={2} mb={4}>
          {connectors.map(c => (
            <ConnectorCard
              key={c.id}
              connector={c}
              isDefault={defaultConnectorId === c.id}
              hasApiKey={hasApiKey(c.id)}
              onToggleEnabled={setEnabled}
              onDelete={remove}
              onSetDefault={handleToggleDefault}
              onTestConnection={testConnection}
              onViewDiagnostics={setDiagConnector}
            />
          ))}
        </Box>
      )}

      <Divider />
      <FeatureReadinessPanel />

      {/* Dialogs */}
      <AddConnectorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={reload}
      />

      <DiagnosticsDialog
        open={!!diagConnector}
        connector={diagConnector}
        onClose={() => setDiagConnector(null)}
        onRunDiagnostics={getDiagnostics}
      />
    </Box>
  );
}
