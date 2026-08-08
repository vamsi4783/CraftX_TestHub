import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stepper, Step, StepLabel, Box, CircularProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ConnectorTypeSelector } from './ConnectorTypeSelector';
import { GeminiConfigForm } from './GeminiConfigForm';
import { OllamaConfigForm } from './OllamaConfigForm';
import { OpenAICompatConfigForm } from './OpenAICompatConfigForm';
import { MCPConfigForm } from './MCPConfigForm';
import { aiConnectorService } from './aiConnectorService';
import type {
  AddGeminiParams, AddOllamaParams, AddOpenAICompatParams, AddMCPParams,
} from './aiConnectorService';
import type { ConnectorKind } from './aiConnectorStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

type FormParams = AddGeminiParams | AddOllamaParams | AddOpenAICompatParams | AddMCPParams;

export function AddConnectorDialog({ open, onClose, onAdded }: Props) {
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [kind, setKind] = useState<ConnectorKind | null>(null);
  const [params, setParams] = useState<FormParams | null>(null);
  const [formValid, setFormValid] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setStep('select');
    setKind(null);
    setParams(null);
    setFormValid(false);
    onClose();
  }

  function handleTypeSelect(k: ConnectorKind) {
    setKind(k);
    setStep('configure');
  }

  function handleFormChange(p: FormParams, valid: boolean) {
    setParams(p);
    setFormValid(valid);
  }

  async function handleSave() {
    if (!kind || !params) return;
    setSaving(true);
    try {
      switch (kind) {
        case 'gemini':
          aiConnectorService.addGemini(params as AddGeminiParams);
          break;
        case 'ollama':
          aiConnectorService.addOllama(params as AddOllamaParams);
          break;
        case 'openai_compatible':
          aiConnectorService.addOpenAICompat(params as AddOpenAICompatParams);
          break;
        case 'mcp':
          aiConnectorService.addMCP(params as AddMCPParams);
          break;
      }
      onAdded();
      handleClose();
    } finally {
      setSaving(false);
    }
  }

  async function discoverModels(endpoint: string): Promise<string[]> {
    return aiConnectorService.discoverModelsFromEndpoint(endpoint);
  }

  const kindLabel: Record<ConnectorKind, string> = {
    gemini:           'Gemini Flash',
    ollama:           'Ollama',
    openai_compatible:'OpenAI-Compatible',
    mcp:              'MCP Agent',
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {step === 'select' ? 'Add AI Connector' : `Configure ${kind ? kindLabel[kind] : ''}`}
      </DialogTitle>

      <DialogContent>
        <Box mb={2}>
          <Stepper activeStep={step === 'select' ? 0 : 1} sx={{ mb: 3 }}>
            <Step><StepLabel>Choose type</StepLabel></Step>
            <Step><StepLabel>Configure</StepLabel></Step>
          </Stepper>

          {step === 'select' && (
            <ConnectorTypeSelector onSelect={handleTypeSelect} />
          )}

          {step === 'configure' && kind === 'gemini' && (
            <GeminiConfigForm
              onChange={(p, v) => handleFormChange(p, v)}
            />
          )}
          {step === 'configure' && kind === 'ollama' && (
            <OllamaConfigForm
              onDiscoverModels={discoverModels}
              onChange={(p, v) => handleFormChange(p, v)}
            />
          )}
          {step === 'configure' && kind === 'openai_compatible' && (
            <OpenAICompatConfigForm
              onChange={(p, v) => handleFormChange(p, v)}
            />
          )}
          {step === 'configure' && kind === 'mcp' && (
            <MCPConfigForm
              onChange={(p, v) => handleFormChange(p, v)}
            />
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 'configure' && (
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => setStep('select')}
            disabled={saving}
          >
            Back
          </Button>
        )}
        <Box flex={1} />
        <Button onClick={handleClose} disabled={saving}>Cancel</Button>
        {step === 'configure' && (
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formValid || saving}
            startIcon={saving ? <CircularProgress size={14} /> : undefined}
            data-testid="save-connector-btn"
          >
            {saving ? 'Saving…' : 'Save Connector'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
