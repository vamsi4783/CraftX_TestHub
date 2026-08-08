import { useState, useCallback } from 'react';
import { aiConnectorService, type ConnectorTestResult } from './aiConnectorService';
import { aiOrchestrationService } from './aiOrchestrationService';
import type { PersistedConnector } from './aiConnectorStore';
import type { ConnectorDiagnosticReport } from '@/ai';

export interface UseAIConnectorsReturn {
  connectors: PersistedConnector[];
  defaultConnectorId: string | undefined;
  reload: () => void;
  setEnabled: (id: string, enabled: boolean) => void;
  setPriority: (id: string, priority: number) => void;
  setDefault: (id: string | undefined) => void;
  remove: (id: string) => void;
  testConnection: (id: string) => Promise<ConnectorTestResult>;
  getDiagnostics: (id: string) => Promise<ConnectorDiagnosticReport | null>;
  discoverModels: (id: string) => Promise<string[]>;
  hasApiKey: (id: string) => boolean;
}

export function useAIConnectors(): UseAIConnectorsReturn {
  const [connectors, setConnectors] = useState<PersistedConnector[]>(
    () => aiConnectorService.list(),
  );
  const [defaultConnectorId, setDefaultConnectorId] = useState<string | undefined>(
    () => aiConnectorService.getDefault(),
  );

  const reload = useCallback(() => {
    setConnectors(aiConnectorService.list());
    setDefaultConnectorId(aiConnectorService.getDefault());
  }, []);

  const setEnabled = useCallback((id: string, enabled: boolean) => {
    aiConnectorService.setEnabled(id, enabled);
    aiOrchestrationService.invalidate();
    reload();
  }, [reload]);

  const setPriority = useCallback((id: string, priority: number) => {
    aiConnectorService.setPriority(id, priority);
    aiOrchestrationService.invalidate();
    reload();
  }, [reload]);

  const setDefault = useCallback((id: string | undefined) => {
    aiConnectorService.setDefault(id);
    setDefaultConnectorId(id);
  }, []);

  const remove = useCallback((id: string) => {
    aiConnectorService.remove(id);
    aiOrchestrationService.invalidate();
    reload();
  }, [reload]);

  const testConnection = useCallback(
    (id: string) => aiConnectorService.testConnection(id),
    [],
  );

  const getDiagnostics = useCallback(
    (id: string) => aiConnectorService.getDiagnostics(id),
    [],
  );

  const discoverModels = useCallback(
    (id: string) => aiConnectorService.discoverModels(id),
    [],
  );

  const hasApiKey = useCallback(
    (id: string) => aiConnectorService.hasApiKey(id),
    [],
  );

  return {
    connectors,
    defaultConnectorId,
    reload,
    setEnabled,
    setPriority,
    setDefault,
    remove,
    testConnection,
    getDiagnostics,
    discoverModels,
    hasApiKey,
  };
}
