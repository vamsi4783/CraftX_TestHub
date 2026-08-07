import { useState, useEffect } from 'react';
import {
  Box, Button, Drawer, FormControl, InputLabel, MenuItem, Select,
  TextField, Typography, Divider, Stack, Chip, IconButton, Alert,
  CircularProgress, ToggleButton, ToggleButtonGroup, Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import SwipeIcon from '@mui/icons-material/Swipe';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import TimerIcon from '@mui/icons-material/Timer';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import KeyIcon from '@mui/icons-material/Key';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { testCaseService } from '@/services/testCaseService';
import { toastSuccess, toastError } from '@/lib/errors';
import type {
  AutomationAction, AutomationConfig, AutomationDriverId, AssertionType, TestCaseStep,
} from '@/types';

// ─── Action metadata ─────────────────────────────────────────────────────────

interface ActionMeta {
  label: string;
  icon: React.ReactElement;
  drivers: AutomationDriverId[];
  description: string;
}

const ACTION_META: Record<AutomationAction, ActionMeta> = {
  tap:         { label: 'Tap',         icon: <TouchAppIcon />,      drivers: ['android','browser'], description: 'Tap a point on screen' },
  swipe:       { label: 'Swipe',       icon: <SwipeIcon />,         drivers: ['android'],           description: 'Swipe from one coordinate to another' },
  type_text:   { label: 'Type Text',   icon: <KeyboardIcon />,      drivers: ['android','browser'], description: 'Type text into the focused field' },
  wait:        { label: 'Wait',        icon: <TimerIcon />,         drivers: ['android','browser'], description: 'Pause execution for a fixed duration' },
  launch_app:  { label: 'Launch App',  icon: <RocketLaunchIcon />,  drivers: ['android'],           description: 'Launch an app by package name' },
  assertion:   { label: 'Assertion',   icon: <FactCheckIcon />,     drivers: ['android','browser'], description: 'Assert a condition about the current UI state' },
  screenshot:  { label: 'Screenshot',  icon: <CameraAltIcon />,     drivers: ['android','browser'], description: 'Capture a screenshot as evidence' },
  press_back:  { label: 'Press Back',  icon: <ArrowBackIcon />,     drivers: ['android'],           description: 'Press the Android back button' },
  press_key:   { label: 'Press Key',   icon: <KeyIcon />,           drivers: ['android'],           description: 'Press a hardware or system key' },
  navigate:    { label: 'Navigate',    icon: <RocketLaunchIcon />,  drivers: ['browser'],           description: 'Navigate to a URL' },
  click:       { label: 'Click',       icon: <TouchAppIcon />,      drivers: ['browser'],           description: 'Click an element by CSS selector' },
  fill:        { label: 'Fill',        icon: <KeyboardIcon />,      drivers: ['browser'],           description: 'Fill an input field' },
  scroll:      { label: 'Scroll',      icon: <SwipeIcon />,         drivers: ['browser'],           description: 'Scroll the page' },
};

// ─── M4 assertion type catalogue ─────────────────────────────────────────────

interface AssertionMeta {
  value:   AssertionType;
  label:   string;
  group:   'Android' | 'Chrome' | 'Common';
  /** Fields this assertion type needs */
  fields:  ('expected' | 'selector' | 'attribute' | 'regex' | 'value' | 'timeout' | 'poll_interval' | 'negate')[];
}

const ASSERTION_TYPES: AssertionMeta[] = [
  // Android
  { value: 'assert_activity',        label: 'Activity is in foreground',   group: 'Android', fields: ['expected', 'negate'] },
  { value: 'assert_package',         label: 'App package is active',        group: 'Android', fields: ['expected', 'negate'] },
  { value: 'assert_text',            label: 'Text is present (Android UI)', group: 'Android', fields: ['expected', 'negate'] },
  { value: 'assert_view_exists',     label: 'View exists (XPath/ID)',       group: 'Android', fields: ['selector', 'negate'] },
  { value: 'assert_screenshot_exists', label: 'Screenshot can be captured', group: 'Android', fields: ['negate'] },
  // Chrome
  { value: 'assert_element_exists',  label: 'Element exists (CSS selector)', group: 'Chrome', fields: ['selector', 'negate'] },
  { value: 'assert_text_exists',     label: 'Text exists on page',           group: 'Chrome', fields: ['expected', 'negate'] },
  { value: 'assert_attribute',       label: 'Element attribute equals',      group: 'Chrome', fields: ['selector', 'attribute', 'expected', 'negate'] },
  { value: 'assert_url',             label: 'Page URL matches',              group: 'Chrome', fields: ['expected', 'negate'] },
  { value: 'assert_title',           label: 'Page title matches',            group: 'Chrome', fields: ['expected', 'negate'] },
  // Common
  { value: 'assert_wait_until',      label: 'Wait until text appears',       group: 'Common', fields: ['expected', 'timeout', 'poll_interval', 'negate'] },
  { value: 'assert_value_equals',    label: 'Value equals (exact)',          group: 'Common', fields: ['expected', 'value', 'negate'] },
  { value: 'assert_regex_match',     label: 'Value matches regex',           group: 'Common', fields: ['regex', 'value', 'negate'] },
];

const ASSERTION_META: Record<AssertionType, AssertionMeta> =
  Object.fromEntries(ASSERTION_TYPES.map(a => [a.value, a])) as Record<AssertionType, AssertionMeta>;

// ─── Empty config factory ────────────────────────────────────────────────────

function emptyConfig(action: AutomationAction, driver: AutomationDriverId): AutomationConfig {
  return { driver_id: driver, action, params: {} };
}

// ─── Field components ────────────────────────────────────────────────────────

function CoordField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      inputProps={{ min: 0 }}
      sx={{ width: 120 }}
    />
  );
}

// ─── Param editors per action ─────────────────────────────────────────────────

function ParamFields({ config, onChange }: {
  config: AutomationConfig;
  onChange: (c: AutomationConfig) => void;
}) {
  const set = (patch: Partial<AutomationConfig['params']>) =>
    onChange({ ...config, params: { ...config.params, ...patch } });

  const p = config.params;

  switch (config.action) {
    case 'tap':
      return (
        <Box>
          <Typography variant="caption" color="text.secondary" mb={1} display="block">Tap coordinates</Typography>
          <Stack direction="row" spacing={1}>
            <CoordField label="X (px)" value={p.x} onChange={x => set({ x })} />
            <CoordField label="Y (px)" value={p.y} onChange={y => set({ y })} />
          </Stack>
        </Box>
      );

    case 'swipe':
      return (
        <Box>
          <Typography variant="caption" color="text.secondary" mb={1} display="block">Swipe start → end</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={1}>
            <CoordField label="From X" value={p.x}  onChange={x  => set({ x  })} />
            <CoordField label="From Y" value={p.y}  onChange={y  => set({ y  })} />
            <CoordField label="To X"   value={p.x2} onChange={x2 => set({ x2 })} />
            <CoordField label="To Y"   value={p.y2} onChange={y2 => set({ y2 })} />
          </Stack>
          <TextField label="Duration (ms)" type="number" size="small" value={p.duration_ms ?? 300}
            onChange={e => set({ duration_ms: Number(e.target.value) })} inputProps={{ min: 50 }} />
        </Box>
      );

    case 'type_text':
      return (
        <TextField label="Text to type" value={p.value ?? ''} onChange={e => set({ value: e.target.value })}
          fullWidth size="small" multiline rows={2} placeholder="Enter text…" />
      );

    case 'wait':
      return (
        <TextField label="Wait duration (ms)" type="number" size="small" value={p.duration_ms ?? 1000}
          onChange={e => set({ duration_ms: Number(e.target.value) })}
          helperText="Execution will pause for this duration" inputProps={{ min: 100 }} />
      );

    case 'launch_app':
      return (
        <TextField label="Package name" value={p.value ?? ''} onChange={e => set({ value: e.target.value })}
          fullWidth size="small" placeholder="e.g. com.example.app"
          helperText="Android package name of the app to launch" />
      );

    case 'assertion': {
      const kind = p.assertion_kind as AssertionType | undefined;
      const meta = kind ? ASSERTION_META[kind] : undefined;
      const fields = meta?.fields ?? [];

      // Group assertions for the dropdown
      const groups = ['Android', 'Chrome', 'Common'] as const;

      return (
        <Box display="flex" flexDirection="column" gap={1.5}>
          {/* Kind selector */}
          <FormControl fullWidth size="small">
            <InputLabel>Assertion type</InputLabel>
            <Select
              label="Assertion type"
              value={kind ?? ''}
              onChange={e => set({ assertion_kind: e.target.value as AssertionType })}
            >
              {groups.map(g => [
                <MenuItem key={g} disabled sx={{ fontWeight: 700, opacity: 0.6, fontSize: 11 }}>
                  — {g} —
                </MenuItem>,
                ...ASSERTION_TYPES.filter(a => a.group === g).map(a => (
                  <MenuItem key={a.value} value={a.value}>{a.label}</MenuItem>
                )),
              ])}
            </Select>
          </FormControl>

          {/* Conditional fields */}
          {fields.includes('expected') && (
            <TextField label="Expected value" size="small" fullWidth
              value={p.expected ?? ''}
              onChange={e => set({ expected: e.target.value })}
              placeholder={
                kind === 'assert_package'  ? 'com.example.app' :
                kind === 'assert_activity' ? 'com.example/.MainActivity' :
                kind === 'assert_url'      ? 'https://example.com' :
                kind === 'assert_title'    ? 'Page Title' :
                'Expected value…'
              }
            />
          )}

          {fields.includes('selector') && (
            <TextField label="Selector" size="small" fullWidth
              value={p.selector ?? ''}
              onChange={e => set({ selector: e.target.value })}
              placeholder={
                kind === 'assert_view_exists'    ? '//Button[@text="Submit"]' :
                kind === 'assert_element_exists' ? '#submit-btn' :
                kind === 'assert_attribute'      ? '.my-class' :
                'XPath / CSS selector / resource-id'
              }
              helperText={
                kind === 'assert_view_exists'    ? 'XPath or resource-id' :
                kind === 'assert_element_exists' ? 'CSS selector' :
                undefined
              }
            />
          )}

          {fields.includes('attribute') && (
            <TextField label="Attribute name" size="small" fullWidth
              value={p.attribute ?? ''}
              onChange={e => set({ attribute: e.target.value })}
              placeholder="e.g. disabled, class, data-state"
            />
          )}

          {fields.includes('value') && (
            <TextField label="Actual value (to compare)" size="small" fullWidth
              value={p.value ?? ''}
              onChange={e => set({ value: e.target.value })}
              placeholder="Value to check…"
            />
          )}

          {fields.includes('regex') && (
            <TextField label="Regex pattern" size="small" fullWidth
              value={p.regex ?? ''}
              onChange={e => set({ regex: e.target.value })}
              placeholder="e.g. ^\d{4}-\d{2}-\d{2}$"
              helperText="JavaScript regular expression (without /…/ delimiters)"
            />
          )}

          {fields.includes('timeout') && (
            <Stack direction="row" spacing={1}>
              <TextField label="Timeout (ms)" type="number" size="small" sx={{ flex: 1 }}
                value={p.timeout_ms ?? 5000}
                onChange={e => set({ timeout_ms: Number(e.target.value) })}
                inputProps={{ min: 500, step: 500 }}
              />
              {fields.includes('poll_interval') && (
                <TextField label="Poll interval (ms)" type="number" size="small" sx={{ flex: 1 }}
                  value={p.poll_interval_ms ?? 500}
                  onChange={e => set({ poll_interval_ms: Number(e.target.value) })}
                  inputProps={{ min: 100, step: 100 }}
                />
              )}
            </Stack>
          )}

          {fields.includes('negate') && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <input type="checkbox" id="negate-cb"
                checked={!!p.negate}
                onChange={e => set({ negate: e.target.checked })}
              />
              <Typography component="label" htmlFor="negate-cb" variant="body2" sx={{ cursor: 'pointer' }}>
                Negate (PASS ↔ FAIL inversion)
              </Typography>
            </Stack>
          )}

          {/* Timeout override for non-wait_until assertions */}
          {kind && kind !== 'assert_wait_until' && (
            <TextField label="Step timeout (ms, optional)" type="number" size="small"
              value={p.timeout_ms ?? ''}
              onChange={e => set({ timeout_ms: e.target.value === '' ? undefined : Number(e.target.value) })}
              helperText="Leave blank to use driver default"
              inputProps={{ min: 1000, step: 1000 }}
            />
          )}
        </Box>
      );
    }

    case 'press_key':
      return (
        <TextField label="Key code" value={p.key ?? ''} onChange={e => set({ key: e.target.value })}
          fullWidth size="small" placeholder="e.g. KEYCODE_HOME, KEYCODE_VOLUME_UP"
          helperText="Android KeyEvent constant name" />
      );

    case 'screenshot':
    case 'press_back':
      return (
        <Alert severity="info" sx={{ py: 0.5 }}>
          No parameters required for this action.
        </Alert>
      );

    default:
      return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AutomationConfigEditorProps {
  open: boolean;
  onClose: () => void;
  step: TestCaseStep;
  testCaseId: string;
}

export function AutomationConfigEditor({ open, onClose, step, testCaseId }: AutomationConfigEditorProps) {
  const qc = useQueryClient();

  const [driver, setDriver] = useState<AutomationDriverId>(
    step.automation_config?.driver_id ?? 'android',
  );
  const [action, setAction] = useState<AutomationAction>(
    step.automation_config?.action ?? 'tap',
  );
  const [config, setConfig] = useState<AutomationConfig>(
    step.automation_config ?? emptyConfig('tap', 'android'),
  );

  // Sync when step prop changes (drawer re-opens for a different step)
  useEffect(() => {
    const ac = step.automation_config;
    setDriver(ac?.driver_id ?? 'android');
    setAction(ac?.action ?? 'tap');
    setConfig(ac ?? emptyConfig('tap', 'android'));
  }, [step.id, open]);

  const handleDriverChange = (d: AutomationDriverId) => {
    setDriver(d);
    // If the current action isn't supported on the new driver, switch to tap
    const supportedActions = (Object.keys(ACTION_META) as AutomationAction[])
      .filter(a => ACTION_META[a].drivers.includes(d));
    const nextAction = supportedActions.includes(action) ? action : 'tap';
    setAction(nextAction);
    setConfig({ ...config, driver_id: d, action: nextAction });
  };

  const handleActionChange = (a: AutomationAction) => {
    setAction(a);
    // Reset params when action changes (different param shape)
    setConfig(emptyConfig(a, driver));
  };

  const saveMutation = useMutation({
    mutationFn: () => testCaseService.saveStepAutomation(step.id, config),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-case', testCaseId] });
      toastSuccess('Automation config saved');
      onClose();
    },
    onError: err => toastError(err),
  });

  const clearMutation = useMutation({
    mutationFn: () => testCaseService.saveStepAutomation(step.id, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['test-case', testCaseId] });
      toastSuccess('Automation config removed');
      onClose();
    },
    onError: err => toastError(err),
  });

  const driverActions = (Object.keys(ACTION_META) as AutomationAction[])
    .filter(a => ACTION_META[a].drivers.includes(driver));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 0 } }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3, py: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: 1, borderColor: 'divider',
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>Automation Config</Typography>
          <Typography variant="caption" color="text.secondary">
            Step {step.step_number}: {step.description.slice(0, 60)}{step.description.length > 60 ? '…' : ''}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ px: 3, py: 2.5, overflowY: 'auto', flex: 1 }}>
        {/* Status badge */}
        {step.automation_config ? (
          <Chip
            label={`Configured: ${ACTION_META[step.automation_config.action].label} · ${step.automation_config.driver_id}`}
            color="success"
            size="small"
            sx={{ mb: 2 }}
          />
        ) : (
          <Chip label="Not configured" size="small" sx={{ mb: 2 }} />
        )}

        {/* Driver selector */}
        <Box mb={2.5}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
            TARGET DRIVER
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={driver}
            onChange={(_, v) => v && handleDriverChange(v as AutomationDriverId)}
            size="small"
          >
            <ToggleButton value="android">Android</ToggleButton>
            <ToggleButton value="browser">Browser</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {/* Action picker */}
        <Box mb={2.5}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
            ACTION
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {driverActions.map(a => {
              const meta = ACTION_META[a];
              return (
                <Tooltip key={a} title={meta.description} placement="top">
                  <ToggleButton
                    value={a}
                    selected={action === a}
                    onChange={() => handleActionChange(a)}
                    size="small"
                    sx={{
                      gap: 0.5, px: 1.5, py: 0.75,
                      '&.Mui-selected': { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } },
                    }}
                  >
                    {meta.icon}
                    <Typography variant="caption" fontWeight={600}>{meta.label}</Typography>
                  </ToggleButton>
                </Tooltip>
              );
            })}
          </Box>
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {/* Param editor */}
        <Box mb={2.5}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1.5}>
            PARAMETERS
          </Typography>
          <ParamFields config={config} onChange={setConfig} />
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {/* Timeout override */}
        <Box mb={2.5}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={1}>
            TIMEOUT OVERRIDE (optional)
          </Typography>
          <TextField
            label="Timeout (ms)"
            type="number"
            size="small"
            value={config.params.timeout_ms ?? ''}
            onChange={e => setConfig({
              ...config,
              params: { ...config.params, timeout_ms: e.target.value === '' ? undefined : Number(e.target.value) },
            })}
            helperText="Leave blank to use the driver default (5 000 ms)"
            inputProps={{ min: 500 }}
          />
        </Box>

        {/* JSON preview */}
        <Box
          component="pre"
          sx={{
            fontSize: 11,
            bgcolor: 'action.hover',
            borderRadius: 1,
            p: 1.5,
            overflowX: 'auto',
            fontFamily: 'monospace',
            color: 'text.secondary',
            mb: 0,
          }}
        >
          {JSON.stringify(config, null, 2)}
        </Box>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 3, py: 2,
          borderTop: 1, borderColor: 'divider',
          display: 'flex', gap: 1, justifyContent: 'flex-end',
        }}
      >
        {step.automation_config && (
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteOutlineIcon />}
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Remove
          </Button>
        )}
        <Button onClick={onClose} size="small">Cancel</Button>
        <Button
          variant="contained"
          size="small"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : 'Save Config'}
        </Button>
      </Box>
    </Drawer>
  );
}
