import {
  Box, Card, CardActionArea, CardContent, Typography, Grid,
} from '@mui/material';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import ComputerIcon from '@mui/icons-material/Computer';
import ApiIcon from '@mui/icons-material/Api';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { ConnectorKind } from './aiConnectorStore';

interface ConnectorType {
  kind: ConnectorKind;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const TYPES: ConnectorType[] = [
  {
    kind:        'gemini',
    label:       'Gemini Flash',
    description: 'Use your own Google AI API key. TestHub does not provide or charge for this API.',
    icon:        <FlashOnIcon sx={{ fontSize: 32 }} />,
    color:       '#4285F4',
  },
  {
    kind:        'ollama',
    label:       'Ollama',
    description: 'Run AI locally on your computer. No cloud API key required.',
    icon:        <ComputerIcon sx={{ fontSize: 32 }} />,
    color:       '#10B981',
  },
  {
    kind:        'openai_compatible',
    label:       'OpenAI-Compatible',
    description: 'Connect any compatible AI endpoint using your own endpoint, API key, and model. Works with Groq, OpenRouter, vLLM, LM Studio, and more.',
    icon:        <ApiIcon sx={{ fontSize: 32 }} />,
    color:       '#6366F1',
  },
  {
    kind:        'mcp',
    label:       'MCP',
    description: 'Connect an external AI agent or MCP-compatible server.',
    icon:        <AccountTreeIcon sx={{ fontSize: 32 }} />,
    color:       '#F59E0B',
  },
];

interface Props {
  onSelect: (kind: ConnectorKind) => void;
}

export function ConnectorTypeSelector({ onSelect }: Props) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Choose the type of AI connector you want to add.
      </Typography>
      <Grid container spacing={2}>
        {TYPES.map(t => (
          <Grid item xs={12} sm={6} key={t.kind}>
            <Card
              variant="outlined"
              sx={{ height: '100%', '&:hover': { borderColor: t.color, boxShadow: 2 } }}
            >
              <CardActionArea
                onClick={() => onSelect(t.kind)}
                sx={{ height: '100%', p: 0.5 }}
                data-testid={`connector-type-${t.kind}`}
              >
                <CardContent>
                  <Box sx={{ color: t.color, mb: 1 }}>{t.icon}</Box>
                  <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                    {t.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t.description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
