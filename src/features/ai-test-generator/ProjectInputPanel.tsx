// ─── Project Input Panel (Phase 4 M6) ─────────────────────────────────────────
// Accepts source code paste + project type selection.
// Triggers project analysis when the user clicks "Analyze".

import {
  Box, Button, FormControl, InputLabel, Select, MenuItem,
  TextField, Typography, Alert, LinearProgress, Chip, Stack,
} from '@mui/material';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AddIcon       from '@mui/icons-material/Add';
import DeleteIcon    from '@mui/icons-material/Delete';
import { useState }  from 'react';
import type { ProjectType } from '@/services/aiTestGenerator';
import type { SourceFile }  from '@/services/aiTestGenerator';

interface Props {
  onAnalyze: (files: SourceFile[], type: ProjectType, projectName: string) => void;
  isAnalyzing: boolean;
}

const PROJECT_TYPES: { value: ProjectType; label: string; hint: string }[] = [
  { value: 'android', label: 'Android',    hint: 'Kotlin/Java — paste Activity, Fragment, Manifest, or layout XML files.' },
  { value: 'react',   label: 'React/Web',  hint: 'TypeScript/JSX — paste component, route, or API files.' },
  { value: 'flutter', label: 'Flutter',    hint: 'Dart — interface support only. Screen and widget detection.' },
  { value: 'generic', label: 'Generic',    hint: 'Any language — basic pattern detection.' },
];

const DEFAULT_FILE: SourceFile = { name: 'main.kt', content: '' };

export function ProjectInputPanel({ onAnalyze, isAnalyzing }: Props) {
  const [projectType, setProjectType] = useState<ProjectType>('android');
  const [projectName, setProjectName] = useState('');
  const [files, setFiles]             = useState<SourceFile[]>([{ ...DEFAULT_FILE }]);

  const hint = PROJECT_TYPES.find(t => t.value === projectType)?.hint ?? '';

  const addFile = () => setFiles(prev => [
    ...prev,
    { name: `file${prev.length + 1}.${projectType === 'react' ? 'tsx' : projectType === 'flutter' ? 'dart' : 'kt'}`, content: '' },
  ]);

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const updateFile = (i: number, field: keyof SourceFile, value: string) =>
    setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f));

  const canAnalyze = files.some(f => f.content.trim().length > 0) && !isAnalyzing;

  return (
    <Box display="flex" flexDirection="column" gap={2.5}>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <TextField
          label="Project name (optional)"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          size="small"
          sx={{ flex: 1 }}
          placeholder="My Android App"
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Project type</InputLabel>
          <Select
            label="Project type"
            value={projectType}
            onChange={e => setProjectType(e.target.value as ProjectType)}
          >
            {PROJECT_TYPES.map(t => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Alert severity="info" sx={{ py: 0.5, fontSize: 13 }}>{hint}</Alert>

      {files.map((file, i) => (
        <Box key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center" mb={1}>
            <TextField
              label="File name"
              value={file.name}
              onChange={e => updateFile(i, 'name', e.target.value)}
              size="small"
              sx={{ flex: 1 }}
            />
            {files.length > 1 && (
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => removeFile(i)}
              >
                Remove
              </Button>
            )}
          </Stack>
          <TextField
            label={`Source code — ${file.name}`}
            value={file.content}
            onChange={e => updateFile(i, 'content', e.target.value)}
            multiline
            minRows={6}
            maxRows={20}
            fullWidth
            size="small"
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
            placeholder="Paste source code here…"
          />
        </Box>
      ))}

      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          startIcon={<AddIcon />}
          size="small"
          variant="outlined"
          onClick={addFile}
          disabled={isAnalyzing}
        >
          Add file
        </Button>

        <Chip label={`${files.filter(f => f.content.trim()).length} / ${files.length} files with content`} size="small" />

        <Box flex={1} />

        <Button
          variant="contained"
          startIcon={<AnalyticsIcon />}
          onClick={() => onAnalyze(files, projectType, projectName)}
          disabled={!canAnalyze}
        >
          {isAnalyzing ? 'Analyzing…' : 'Analyze Project'}
        </Button>
      </Stack>

      {isAnalyzing && <LinearProgress />}
    </Box>
  );
}
