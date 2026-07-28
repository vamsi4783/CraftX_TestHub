import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, TextField, Typography, Card, CardContent, Chip, InputAdornment,
  List, ListItem, ListItemText, ListItemIcon, Divider, CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FolderIcon from '@mui/icons-material/Folder';
import BugReportIcon from '@mui/icons-material/BugReport';
import AssignmentIcon from '@mui/icons-material/Assignment';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusChip } from '@/components/common/StatusChip';
import { SeverityChip } from '@/components/common/SeverityChip';

interface SearchResult {
  type: 'project' | 'bug' | 'test_case' | 'feature_request' | 'release';
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  severity?: string;
  url: string;
}

async function globalSearch(q: string): Promise<SearchResult[]> {
  if (!q || q.length < 2) return [];
  const term = q.trim();
  const results: SearchResult[] = [];

  const [projects, bugs, tests, features, releases] = await Promise.allSettled([
    supabase.from('projects').select('id,name,description,status').ilike('name', `%${term}%`).limit(5),
    supabase.from('bugs').select('id,bug_id,title,severity,status').or(`title.ilike.%${term}%,bug_id.ilike.%${term}%`).limit(5),
    supabase.from('test_cases').select('id,test_id,title,priority,status').or(`title.ilike.%${term}%,test_id.ilike.%${term}%`).limit(5),
    supabase.from('feature_requests').select('id,title,status,priority').ilike('title', `%${term}%`).limit(5),
    supabase.from('releases').select('id,name,version,status').ilike('name', `%${term}%`).limit(5),
  ]);

  if (projects.status === 'fulfilled') {
    projects.value.data?.forEach(p => results.push({ type: 'project', id: p.id, title: p.name, subtitle: p.description || 'Project', status: p.status, url: `/projects/${p.id}` }));
  }
  if (bugs.status === 'fulfilled') {
    bugs.value.data?.forEach(b => results.push({ type: 'bug', id: b.id, title: `${b.bug_id}: ${b.title}`, subtitle: 'Bug', status: b.status, severity: b.severity, url: `/bugs/${b.id}` }));
  }
  if (tests.status === 'fulfilled') {
    tests.value.data?.forEach(t => results.push({ type: 'test_case', id: t.id, title: `${t.test_id}: ${t.title}`, subtitle: 'Test Case', status: t.status, url: `/test-cases` }));
  }
  if (features.status === 'fulfilled') {
    features.value.data?.forEach(f => results.push({ type: 'feature_request', id: f.id, title: f.title, subtitle: 'Feature Request', status: f.status, url: `/features` }));
  }
  if (releases.status === 'fulfilled') {
    releases.value.data?.forEach(r => results.push({ type: 'release', id: r.id, title: `${r.name} v${r.version}`, subtitle: 'Release', status: r.status, url: `/releases/${r.id}` }));
  }
  return results;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  project: <FolderIcon color="primary" />,
  bug: <BugReportIcon color="error" />,
  test_case: <AssignmentIcon color="info" />,
  feature_request: <LightbulbIcon sx={{ color: '#7C3AED' }} />,
  release: <RocketLaunchIcon color="success" />,
};

const TYPE_LABELS: Record<string, string> = {
  project: 'Project', bug: 'Bug', test_case: 'Test Case',
  feature_request: 'Feature', release: 'Release',
};

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.get('q') || '');

  useEffect(() => { setParams(q ? { q } : {}); }, [q, setParams]);

  const { data = [], isFetching } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => globalSearch(q),
    enabled: q.length >= 2,
  });

  const grouped = data.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r); return acc;
  }, {});

  return (
    <Box maxWidth={720}>
      <PageHeader title="Search" subtitle="Search across projects, bugs, test cases, and more." />

      <TextField
        fullWidth autoFocus value={q} onChange={e => setQ(e.target.value)}
        placeholder="Search projects, bugs, test cases…"
        InputProps={{
          startAdornment: <InputAdornment position="start">{isFetching ? <CircularProgress size={18} /> : <SearchIcon />}</InputAdornment>,
        }}
        sx={{ mb: 3 }}
      />

      {q.length < 2 ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
          Type at least 2 characters to search.
        </Typography>
      ) : data.length === 0 && !isFetching ? (
        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
          No results found for "<strong>{q}</strong>"
        </Typography>
      ) : (
        Object.entries(grouped).map(([type, items]) => (
          <Card key={type} sx={{ mb: 2 }}>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="overline" color="text.secondary" fontWeight={700}>{TYPE_LABELS[type]}s</Typography>
            </CardContent>
            <List dense>
              {items.map((item, i) => (
                <Box key={item.id}>
                  {i > 0 && <Divider />}
                  <ListItem button onClick={() => navigate(item.url)} sx={{ py: 1.5, '&:hover': { bgcolor: 'action.hover' } }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>{TYPE_ICONS[item.type]}</ListItemIcon>
                    <ListItemText
                      primary={<Typography variant="body2" fontWeight={600}>{item.title}</Typography>}
                      secondary={item.subtitle}
                    />
                    <Box display="flex" gap={1}>
                      {item.severity && <SeverityChip value={item.severity} size="small" />}
                      {item.status && <StatusChip status={item.status} size="small" />}
                    </Box>
                  </ListItem>
                </Box>
              ))}
            </List>
          </Card>
        ))
      )}
    </Box>
  );
}
