import { memo } from 'react';
import { Box, Card, CardContent, Typography, Skeleton, useTheme } from '@mui/material';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ── Palette ───────────────────────────────────────────────────────────────────

export const CHART_COLORS = {
  primary:  '#4F46E5',
  success:  '#10B981',
  warning:  '#F59E0B',
  error:    '#EF4444',
  info:     '#06B6D4',
  purple:   '#7C3AED',
  pink:     '#EC4899',
  muted:    '#9CA3AF',
  SERIES:   ['#4F46E5','#10B981','#F59E0B','#EF4444','#06B6D4','#7C3AED','#EC4899','#F97316'],
};

// ── StatCard ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string | undefined;
  color?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  subtitle?: string;
  trend?: { value: number; label: string };
}

export const StatCard = memo(function StatCard({ label, value, color = CHART_COLORS.primary, icon, onClick, loading, subtitle, trend }: StatCardProps) {
  return (
    <Card
      sx={{ cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { boxShadow: 4, transform: 'translateY(-1px)' } : {}, transition: 'all .15s' }}
      onClick={onClick}
    >
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box flex={1} minWidth={0}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing={0.5} noWrap>
              {label}
            </Typography>
            {loading ? (
              <Skeleton variant="text" width={60} height={48} />
            ) : (
              <Typography variant="h4" fontWeight={800} color={color} lineHeight={1.1} mt={0.25}>
                {value ?? '—'}
              </Typography>
            )}
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
            {trend && (
              <Typography variant="caption" color={trend.value >= 0 ? 'success.main' : 'error.main'} fontWeight={600}>
                {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value)}% {trend.label}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box sx={{ color, opacity: 0.75, ml: 1, flexShrink: 0 }}>{icon}</Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
});

// ── Chart card wrapper ────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  height?: number;
  loading?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export const ChartCard = memo(function ChartCard({ title, subtitle, height = 220, loading, children, action }: ChartCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {action}
        </Box>
        {loading ? (
          <Skeleton variant="rectangular" height={height} sx={{ borderRadius: 1 }} />
        ) : (
          <Box height={height}>{children}</Box>
        )}
      </CardContent>
    </Card>
  );
});

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string; fill?: string }>; label?: string }) {
  const theme = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ bgcolor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 1, p: 1.25, boxShadow: 2, minWidth: 120 }}>
      {label && <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{label}</Typography>}
      {payload.map((p, i) => (
        <Box key={i} display="flex" alignItems="center" gap={0.75}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color ?? p.fill ?? CHART_COLORS.primary, flexShrink: 0 }} />
          <Typography variant="caption" color="text.secondary">{p.name}:</Typography>
          <Typography variant="caption" fontWeight={700}>{p.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

// ── Area/Line Trend Chart ─────────────────────────────────────────────────────

interface TrendChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: Array<{ key: string; label: string; color: string; type?: 'area' | 'line' }>;
  height?: number;
  xTickFormatter?: (v: string) => string;
}

export const TrendChart = memo(function TrendChart({ data, xKey, series, height = 200, xTickFormatter }: TrendChartProps) {
  const theme = useTheme();
  const grid = theme.palette.divider;
  const tick = { fontSize: 11, fill: theme.palette.text.secondary };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          {series.map(s => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false}
          tickFormatter={xTickFormatter ?? ((v: string) => v.slice(5))} />
        <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map(s => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color} strokeWidth={2} fill={`url(#grad-${s.key})`} dot={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
});

// ── Multi-Line Chart ──────────────────────────────────────────────────────────

export const MultiLineChart = memo(function MultiLineChart({ data, xKey, series, height = 200, xTickFormatter }: TrendChartProps) {
  const theme = useTheme();
  const grid = theme.palette.divider;
  const tick = { fontSize: 11, fill: theme.palette.text.secondary };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false}
          tickFormatter={xTickFormatter ?? ((v: string) => v.slice(5))} />
        <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map(s => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

// ── Vertical Bar Chart ────────────────────────────────────────────────────────

interface BarChartProps {
  data: Array<{ name: string; value: number; fill?: string }>;
  height?: number;
  color?: string;
  xTickFormatter?: (v: string) => string;
}

export const VerticalBarChart = memo(function VerticalBarChart({ data, height = 200, color = CHART_COLORS.primary, xTickFormatter }: BarChartProps) {
  const theme = useTheme();
  const tick = { fontSize: 11, fill: theme.palette.text.secondary };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
        <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={false}
          tickFormatter={xTickFormatter} />
        <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name="Count" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill ?? color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Multi-series Bar Chart ────────────────────────────────────────────────────

interface MultiBarProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: Array<{ key: string; label: string; color: string }>;
  height?: number;
  stacked?: boolean;
  xTickFormatter?: (v: string) => string;
}

export const MultiBarChart = memo(function MultiBarChart({ data, xKey, series, height = 200, stacked, xTickFormatter }: MultiBarProps) {
  const theme = useTheme();
  const tick = { fontSize: 11, fill: theme.palette.text.secondary };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
        <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false}
          tickFormatter={xTickFormatter ?? ((v: string) => v.slice(5))} />
        <YAxis tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map(s => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color}
            radius={stacked ? undefined : [4, 4, 0, 0]} stackId={stacked ? 'stack' : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Horizontal Bar Chart ──────────────────────────────────────────────────────

interface HBarProps {
  data: Array<{ name: string; value: number; fill?: string; max?: number }>;
  height?: number;
  color?: string;
}

export const HorizontalBarChart = memo(function HorizontalBarChart({ data, height, color = CHART_COLORS.primary }: HBarProps) {
  const theme = useTheme();
  const tick = { fontSize: 11, fill: theme.palette.text.secondary };
  const h = height ?? Math.max(data.length * 36, 120);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} horizontal={false} />
        <XAxis type="number" tick={tick} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={tick} tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill ?? color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

// ── Donut / Pie Chart ─────────────────────────────────────────────────────────

interface DonutProps {
  data: Array<{ name: string; value: number; fill: string }>;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
}

export const DonutChart = memo(function DonutChart({ data, height = 200, innerRadius = 55, outerRadius = 80, showLegend = true }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" cx="50%" cy="50%"
          innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={2}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Pie>
        <Tooltip formatter={(value: number) => [`${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`, '']} />
        {showLegend && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {/* Center label */}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
          <tspan x="50%" dy="-6" fontSize={22} fontWeight={800} fill="currentColor">{total}</tspan>
          <tspan x="50%" dy={18} fontSize={11} fill="#9CA3AF">Total</tspan>
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
});

// ── Empty chart state ─────────────────────────────────────────────────────────

export function EmptyChart({ message = 'No data available', height = 160 }: { message?: string; height?: number }) {
  return (
    <Box display="flex" alignItems="center" justifyContent="center" height={height}>
      <Typography variant="body2" color="text.disabled">{message}</Typography>
    </Box>
  );
}
