#!/usr/bin/env npx tsx
// RetailManager V2 RC1 — Complete QA Seed Script
// Usage: npx tsx scripts/seed-rm-qa.ts <email> <password>
// or:    SEED_EMAIL=x SEED_PASSWORD=y npx tsx scripts/seed-rm-qa.ts

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { MODULES, TEST_CASES_PART1, type TestCaseDef } from './seed-rm-data-part1';
import { TEST_CASES_PART2 } from './seed-rm-data-part2';
import { TEST_CASES_PART3 } from './seed-rm-data-part3';

// ─── Config ──────────────────────────────────────────────────────────────────
function loadEnv(): { url: string; anonKey: string } {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  const url = env['VITE_SUPABASE_URL'];
  const anonKey = env['VITE_SUPABASE_ANON_KEY'];
  if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  return { url, anonKey };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function retry<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      await sleep(delayMs * (i + 1));
    }
  }
  throw new Error('unreachable');
}

// ─── Project ─────────────────────────────────────────────────────────────────
async function createProject(supabase: SupabaseClient, userId: string, existingProjectId?: string): Promise<string> {
  // Use existing project if provided
  if (existingProjectId) return existingProjectId;

  // Try to find existing project by slug
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', 'retailmanager-v2')
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: 'RetailManager',
      slug: 'retailmanager-v2',
      description: 'RetailManager is a cross-platform retail management system for small and medium businesses supporting inventory, sales, purchases, suppliers, customers, expenses, reporting, subscriptions, and cloud synchronization.',
      platform: 'cross_platform',
      version: '2.0',
      color: '#4F46E5',
      repository_url: 'https://github.com/vamsi4783/RetailManager',
      tags: ['retail', 'pos', 'inventory', 'gst', 'android', 'rc1'],
      owner_id: userId,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw new Error(`Create project: ${error.message}`);
  return data.id;
}

// ─── Modules ─────────────────────────────────────────────────────────────────
async function createModules(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<Map<string, string>> {
  const moduleIdMap = new Map<string, string>();

  for (const mod of MODULES) {
    const { data, error } = await retry(() =>
      supabase
        .from('modules')
        .upsert(
          { project_id: projectId, name: mod.name, description: mod.description, created_by: userId },
          { onConflict: 'project_id,name', ignoreDuplicates: false }
        )
        .select('id')
        .single()
    );
    if (error) throw new Error(`Create module "${mod.name}": ${error.message}`);
    moduleIdMap.set(mod.name, data.id);
    process.stdout.write('.');
  }
  return moduleIdMap;
}

// ─── Release ─────────────────────────────────────────────────────────────────
async function createRelease(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<string> {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 30);

  const { data: existing } = await supabase
    .from('releases')
    .select('id')
    .eq('project_id', projectId)
    .eq('version', '2.0.0-rc1')
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('releases')
    .insert({
      project_id: projectId,
      name: 'Release Candidate 1',
      version: '2.0.0-rc1',
      build_number: '200001',
      description: 'RC1 is the first release candidate for RetailManager V2. All major features are complete. This release focuses on bug fixes, performance improvements, and production readiness validation.',
      start_date: today.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      status: 'testing',
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Create release: ${error.message}`);
  return data.id;
}

// ─── Test Cases ───────────────────────────────────────────────────────────────
async function createTestCase(
  supabase: SupabaseClient,
  projectId: string,
  moduleIdMap: Map<string, string>,
  userId: string,
  tc: TestCaseDef,
): Promise<string> {
  const moduleId = moduleIdMap.get(tc.module);
  if (!moduleId) throw new Error(`Module not found: ${tc.module}`);

  // Combine steps into description
  const stepsSummary = tc.steps.map((s, i) => `Step ${i + 1}: ${s.description}`).join('\n');
  const expectedSummary = tc.steps.map((s, i) => `Step ${i + 1}: ${s.expected_result}`).join('\n');

  const { data, error } = await retry(() =>
    supabase
      .from('test_cases')
      .insert({
        project_id: projectId,
        module_id: moduleId,
        title: tc.title,
        description: stepsSummary,
        priority: tc.priority,
        status: 'active',
        estimated_minutes: tc.estimated_minutes,
        is_automation_ready: tc.is_automation_ready,
        preconditions: tc.preconditions,
        expected_result: expectedSummary,
        tags: tc.tags,
        is_regression: tc.is_regression,
        created_by: userId,
      })
      .select('id')
      .single()
  );

  if (error) throw new Error(`Create test case "${tc.title}": ${error.message}`);

  // Insert steps
  const steps = tc.steps.map((s, i) => ({
    test_case_id: data.id,
    step_number: i + 1,
    description: s.description,
    expected_result: s.expected_result,
    notes: s.notes || null,
  }));

  const { error: stepsError } = await retry(() =>
    supabase.from('test_case_steps').insert(steps)
  );

  if (stepsError) {
    console.warn(`  ⚠ Steps for "${tc.title}": ${stepsError.message}`);
  }

  return data.id;
}

// ─── Test Plans ───────────────────────────────────────────────────────────────
const TEST_PLANS = [
  {
    name: 'Smoke Testing',
    description: 'Critical path verification to confirm the build is stable enough for further testing. Covers core workflows: login, create sale, view dashboard. Target: under 30 minutes.',
    tags: ['smoke'],
  },
  {
    name: 'Sanity Testing',
    description: 'Narrow regression suite executed after a bug fix or minor change to verify the fix works and nothing critical is broken. Focused on the changed module plus integration points.',
    tags: ['sanity', 'regression'],
  },
  {
    name: 'Functional Testing',
    description: 'Comprehensive functional coverage of all 26 modules. Verifies that every feature works as specified in the PRD. Includes positive, negative, and boundary test cases.',
    tags: ['functional'],
  },
  {
    name: 'Regression Testing',
    description: 'Full regression suite covering all business-critical flows. Executed before every release to ensure new changes have not broken existing functionality.',
    tags: ['regression'],
  },
  {
    name: 'Integration Testing',
    description: 'End-to-end integration scenarios covering interactions between modules: Sale → Inventory → Reports, Purchase → Supplier Ledger → GST, Cloud Sync → Offline → Reconciliation.',
    tags: ['integration'],
  },
  {
    name: 'Performance Testing',
    description: 'Non-functional performance validation: app startup time, POS responsiveness with 10K products, report generation with 1 year of data, concurrent user load testing.',
    tags: ['performance'],
  },
  {
    name: 'Security Testing',
    description: 'Security validation covering authentication, authorization, data isolation, JWT handling, SQL injection, XSS, session management, and API rate limiting.',
    tags: ['security'],
  },
  {
    name: 'User Acceptance Testing (UAT)',
    description: 'Business-owner focused test scenarios simulating real retail operations: open store, purchase inventory, add products, process sales, print invoices, close day, generate reports.',
    tags: ['uat'],
  },
  {
    name: 'Production Readiness',
    description: 'Pre-release gate checklist covering all critical systems: Authentication, Database integrity, API stability, GST compliance, Payment flows, Cloud sync, Backup/Restore, and Play Store build validation.',
    tags: ['production', 'release'],
  },
];

async function createTestPlans(
  supabase: SupabaseClient,
  projectId: string,
  releaseId: string,
  userId: string,
  allTestCaseIds: string[],
  tcDefMap: Map<string, { tags: string[]; is_regression: boolean }>,
): Promise<void> {
  const idByIndex = allTestCaseIds;

  for (const plan of TEST_PLANS) {
    const { data, error } = await retry(() =>
      supabase
        .from('test_plans')
        .insert({
          project_id: projectId,
          name: plan.name,
          description: plan.description,
          release_id: releaseId,
          status: 'active',
          created_by: userId,
        })
        .select('id')
        .single()
    );

    if (error) throw new Error(`Create plan "${plan.name}": ${error.message}`);

    // Select cases for this plan based on matching tags
    const planTags = new Set(plan.tags);
    const caseIds = idByIndex.filter((_, i) => {
      const allCases = [...TEST_CASES_PART1, ...TEST_CASES_PART2, ...TEST_CASES_PART3];
      const tc = allCases[i];
      if (!tc) return false;

      if (planTags.has('smoke')) return tc.tags.includes('smoke');
      if (planTags.has('performance')) return tc.tags.includes('performance') || tc.module === 'Performance';
      if (planTags.has('security')) return tc.tags.includes('security') || tc.module === 'Security';
      if (planTags.has('uat')) return tc.tags.includes('uat') ||
        ['Authentication', 'Sales', 'Products', 'Inventory', 'Reports', 'Invoice'].includes(tc.module) && tc.priority === 'critical';
      if (planTags.has('regression')) return tc.is_regression;
      if (planTags.has('integration')) return tc.tags.some(t => ['integration', 'grn', 'gst', 'offline', 'sync', 'cloud-sync'].includes(t));
      if (planTags.has('production')) return tc.priority === 'critical' || tc.is_regression;
      if (planTags.has('sanity')) return tc.priority === 'critical' && tc.tags.includes('smoke');
      // functional = all cases
      return true;
    });

    if (caseIds.length > 0) {
      const rows = caseIds.slice(0, 300).map((tcId, i) => ({
        plan_id: data.id,
        test_case_id: tcId,
        order_index: i,
      }));

      const { error: addError } = await retry(() =>
        supabase.from('test_plan_cases').insert(rows)
      );
      if (addError) console.warn(`  ⚠ Add cases to plan "${plan.name}": ${addError.message}`);
    }

    console.log(`  ✓ Plan "${plan.name}" — ${caseIds.length} cases linked`);
  }
}

// ─── Bug Templates ────────────────────────────────────────────────────────────
const BUG_TEMPLATES = [
  {
    title: '[CRITICAL] App crashes when completing sale with offline sync pending',
    severity: 'critical' as const,
    priority: 'p1' as const,
    module: 'Sales',
    description: 'App crashes with NullPointerException when user attempts to complete a sale while there are pending offline sync items in queue.',
    steps_to_reproduce: '1. Disable internet\n2. Create 3 sales offline\n3. Re-enable internet\n4. Immediately create another sale and complete payment\n5. App crashes on payment confirmation',
    expected_result: 'Sale completes successfully. Sync queue processes without interference.',
    actual_result: 'App crashes. InvoiceProcessor.kt line 247: NullPointerException on syncQueue reference.',
    environment: 'Android 13, RetailManager v2.0.0-rc1, Build 200001',
    tags: ['crash', 'offline', 'sales', 'critical'],
  },
  {
    title: '[HIGH] GST calculation incorrect for 28% rate products with discount',
    severity: 'high' as const,
    priority: 'p1' as const,
    module: 'GST',
    description: 'When a product with 28% GST rate has a line item discount applied, GST is calculated on the pre-discount price instead of post-discount price.',
    steps_to_reproduce: '1. Add product with GST 28% and price ₹1,000\n2. Apply 10% item discount → price should be ₹900\n3. Observe GST calculation',
    expected_result: 'GST 28% calculated on ₹900 = ₹252. Total = ₹1,152.',
    actual_result: 'GST 28% calculated on ₹1,000 = ₹280. Total = ₹1,180. GST overcharged by ₹28.',
    environment: 'Android 12+, v2.0.0-rc1',
    tags: ['gst', 'discount', 'high', 'calculation'],
  },
  {
    title: '[HIGH] Invoice number skips when sale cancelled mid-process',
    severity: 'high' as const,
    priority: 'p2' as const,
    module: 'Invoice',
    description: 'Invoice number is reserved and incremented even when the sale is cancelled after the "Confirm Payment" button is tapped. This creates gaps in invoice numbering sequence.',
    steps_to_reproduce: '1. Add items to POS cart\n2. Tap Checkout and Confirm Payment\n3. Back out (press back button) before final confirmation\n4. Check last invoice number vs next new invoice number',
    expected_result: 'Invoice number only increments when invoice is successfully saved.',
    actual_result: 'Invoice number incremented (e.g., INV-0099 skipped). Next invoice is INV-0100.',
    environment: 'All Android versions, v2.0.0-rc1',
    tags: ['invoice', 'numbering', 'high'],
  },
  {
    title: '[MEDIUM] Dashboard KPIs not refreshed after cloud sync',
    severity: 'medium' as const,
    priority: 'p2' as const,
    module: 'Dashboard',
    description: 'After offline-made sales sync to the server, the Dashboard KPI values (Today\'s Sales, Invoice Count) do not refresh automatically. User must pull-to-refresh manually.',
    steps_to_reproduce: '1. Complete a sale while offline\n2. Restore internet\n3. Wait for sync to complete\n4. Observe Dashboard',
    expected_result: 'Dashboard KPIs update automatically within 5 seconds of sync completion.',
    actual_result: 'Dashboard shows stale values. Manual pull-to-refresh required.',
    environment: 'Android 11+, v2.0.0-rc1',
    tags: ['dashboard', 'sync', 'medium', 'ui'],
  },
  {
    title: '[LOW] Product search results order inconsistent on rapid typing',
    severity: 'low' as const,
    priority: 'p3' as const,
    module: 'Search',
    description: 'When user types rapidly in the product search bar, search result ordering can be inconsistent due to race condition between multiple pending search requests.',
    steps_to_reproduce: '1. Open POS product search\n2. Type 5 characters very rapidly (type one character every 50ms)\n3. Observe results when typing stops',
    expected_result: 'Results always match the final search query characters.',
    actual_result: 'Occasionally shows results from an intermediate query (e.g., 3-character match appears briefly before 5-character results).',
    environment: 'All versions',
    tags: ['search', 'low', 'race-condition', 'ui'],
  },
  {
    title: '[ENHANCEMENT] Add keyboard shortcut for new sale in POS',
    severity: 'low' as const,
    priority: 'p3' as const,
    module: 'Sales',
    description: 'Request from power users to add keyboard shortcut (e.g., Ctrl+N or F2) to open new sale from Dashboard. Useful for connected keyboard users at retail counter.',
    steps_to_reproduce: 'N/A — Enhancement request',
    expected_result: 'Pressing F2 or Ctrl+N anywhere in app opens POS new sale screen.',
    actual_result: 'No keyboard shortcut available. Must tap button.',
    environment: 'Devices with physical keyboard',
    tags: ['enhancement', 'keyboard', 'pos', 'ux'],
  },
  {
    title: '[UI BUG] Low stock badge overlaps product name on small screens',
    severity: 'low' as const,
    priority: 'p3' as const,
    module: 'Products',
    description: 'On devices with screen width < 360dp, the "Low Stock" badge in product list overlaps with the product name text, making it unreadable.',
    steps_to_reproduce: '1. Open app on small screen device (360dp width or emulator)\n2. Navigate to Products list\n3. Observe products with low stock badge',
    expected_result: 'Badge positioned below product name or text truncates gracefully.',
    actual_result: '"Low Stock" badge overlaps the last 2-3 characters of the product name.',
    environment: 'Devices with screen width ≤ 360dp',
    tags: ['ui-bug', 'products', 'responsive', 'small-screen'],
  },
  {
    title: '[PERFORMANCE] Report generation hangs for accounts with 2+ years of data',
    severity: 'high' as const,
    priority: 'p2' as const,
    module: 'Reports',
    description: 'Annual P&L report generation for accounts with 24+ months of transaction history takes over 60 seconds and sometimes triggers ANR on mid-range devices.',
    steps_to_reproduce: '1. Use account with 24+ months of data\n2. Navigate to Reports > P&L > Select "All Time" range\n3. Wait and observe',
    expected_result: 'Report generates within 15 seconds with progress indicator.',
    actual_result: 'App hangs for 60+ seconds. On mid-range devices, Android ANR dialog appears.',
    environment: 'Accounts >24 months old, Mid-range Android (Snapdragon 662), v2.0.0-rc1',
    tags: ['performance', 'reports', 'high', 'anr'],
  },
  {
    title: '[SECURITY] Password reset link valid for 24 hours instead of 1 hour',
    severity: 'high' as const,
    priority: 'p1' as const,
    module: 'Authentication',
    description: 'Password reset email links remain valid for 24 hours. Industry security standard requires links to expire in 1 hour to prevent misuse if email is compromised.',
    steps_to_reproduce: '1. Request password reset\n2. Wait 2 hours\n3. Click reset link in email',
    expected_result: 'Link expires after 1 hour with message "Reset link expired. Request a new one."',
    actual_result: 'Reset link valid for full 24 hours.',
    environment: 'All platforms',
    tags: ['security', 'auth', 'password-reset', 'high'],
  },
  {
    title: '[DATA LOSS] Stock adjustment loses data when app backgrounded during save',
    severity: 'critical' as const,
    priority: 'p1' as const,
    module: 'Inventory',
    description: 'If user switches to another app during the stock adjustment save, the request is cancelled by the OS and the adjustment is lost without any error shown.',
    steps_to_reproduce: '1. Create stock adjustment (+50 units)\n2. Tap Save\n3. Immediately switch to another app within 500ms\n4. Return to RetailManager',
    expected_result: 'Save completes in background OR app re-queues the save on foreground. No data loss.',
    actual_result: 'Adjustment lost. No error shown. Stock unchanged. User unaware of failure.',
    environment: 'Android 12+ (strict background process limits), v2.0.0-rc1',
    tags: ['data-loss', 'inventory', 'critical', 'background'],
  },
];

async function createBugTemplates(
  supabase: SupabaseClient,
  projectId: string,
  moduleIdMap: Map<string, string>,
  userId: string,
): Promise<void> {
  for (const bug of BUG_TEMPLATES) {
    const moduleId = moduleIdMap.get(bug.module);

    const { error } = await retry(() =>
      supabase.from('bugs').insert({
        project_id: projectId,
        module_id: moduleId || null,
        title: bug.title,
        severity: bug.severity,
        priority: bug.priority,
        status: 'new' as const,
        description: bug.description,
        steps_to_reproduce: bug.steps_to_reproduce,
        expected_result: bug.expected_result,
        actual_result: bug.actual_result,
        environment: bug.environment,
        tags: bug.tags,
        reported_by: userId,
        app_version: '2.0.0-rc1',
        build_number: '200001',
        is_regression: false,
      })
    );

    if (error) console.warn(`  ⚠ Bug template "${bug.title.substring(0, 40)}...": ${error.message}`);
    else process.stdout.write('b');
  }
}

// ─── Release Checklist ────────────────────────────────────────────────────────
const RELEASE_CHECKLIST = [
  { item: 'Authentication: Login, logout, session persistence, JWT expiry tested', category: 'Security' },
  { item: 'Database: Migration v049 applied successfully on clean install and upgrade', category: 'Database' },
  { item: 'API: All v1 endpoints return expected responses. No breaking changes.', category: 'API' },
  { item: 'Payments: Cash, UPI, Card, Credit payment modes fully functional', category: 'Payments' },
  { item: 'Subscriptions: Free/Pro/Enterprise plan feature gates working correctly', category: 'Subscription' },
  { item: 'Inventory: Stock deduction on sale, increment on GRN, adjustments all verified', category: 'Inventory' },
  { item: 'Sales: POS end-to-end flow tested offline and online', category: 'Sales' },
  { item: 'Purchase: PO → GRN → Supplier payment flow verified', category: 'Purchase' },
  { item: 'Reports: Sales, P&L, GSTR-1, GSTR-2, Inventory, Outstanding reports verified', category: 'Reports' },
  { item: 'Performance: Cold start <3s, POS search <500ms, report generation <10s on 10K invoices', category: 'Performance' },
  { item: 'Security: SQL injection, XSS, IDOR, JWT hardening all verified. Pen test passed.', category: 'Security' },
  { item: 'Backup: Manual backup creates valid file. Automated backup schedule works.', category: 'Backup' },
  { item: 'Restore: Backup file restores all data correctly on clean device.', category: 'Restore' },
  { item: 'Notifications: Low stock, payment due, subscription renewal notifications delivered', category: 'Notifications' },
  { item: 'Printing: 58mm and 80mm thermal printer support verified. GST invoice layout correct.', category: 'Printing' },
  { item: 'Crash Testing: 0 crashes in 24-hour stress test on reference devices', category: 'Stability' },
  { item: 'Play Store Build: AAB signed with production keystore. Target API 34. Passed review guidelines.', category: 'Release' },
  { item: 'GST: GSTR-1 and GSTR-3B figures reconcile. E-invoice IRN generation verified.', category: 'Compliance' },
  { item: 'Cloud Sync: Offline → online sync verified. Conflict resolution tested on 2-device setup.', category: 'Cloud Sync' },
  { item: 'Offline Mode: Full sales workflow functional without internet. Queue syncs on reconnect.', category: 'Offline' },
];

async function createReleaseChecklist(
  supabase: SupabaseClient,
  _projectId: string,
  releaseId: string,
  userId: string,
): Promise<void> {
  // Use the QA Approval checklist built into releases
  const checklistNotes = RELEASE_CHECKLIST.map(i => `[${i.category}] ${i.item}`).join('\n');

  const { error } = await supabase.from('release_approvals').upsert({
    release_id: releaseId,
    status: 'pending',
    approved_by: null,
    notes: `RC1 Production Release Checklist:\n\n${checklistNotes}`,
    checklist: {
      critical_bugs_closed: false,
      required_tests_executed: false,
      coverage_target_reached: false,
      no_blocked_tests: false,
      release_notes_completed: false,
      known_issues_documented: false,
      regression_passed: false,
    },
  }, { onConflict: 'release_id' });

  if (error) console.warn(`  ⚠ Release approval: ${error.message}`);
  else console.log(`   ✓ QA Approval record created for release`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const email = process.argv[2] || process.env['SEED_EMAIL'];
  const password = process.argv[3] || process.env['SEED_PASSWORD'];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/seed-rm-qa.ts <email> <password>');
    console.error('   Or: SEED_EMAIL=x SEED_PASSWORD=y npx tsx scripts/seed-rm-qa.ts');
    process.exit(1);
  }

  console.log('\n🚀 RetailManager V2 RC1 — QA Project Seed\n');

  // Load env
  const { url, anonKey } = loadEnv();

  // Auth — sign in first with a temporary client to get the access token
  console.log('1. Authenticating...');
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password });
  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  const userId = authData.user.id;
  const accessToken = authData.session.access_token;

  // Create a new client with the user's JWT so RLS sees auth.uid() correctly
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  console.log(`   ✓ Logged in as ${email} (${userId})\n`);

  // Project
  console.log('2. Creating project "RetailManager"...');
  const projectId = await createProject(supabase, userId, 'c6c09d51-0bb6-4169-9792-1115ca37de32');
  console.log(`   ✓ Project ID: ${projectId}\n`);

  // Modules
  console.log('3. Creating 26 modules...');
  process.stdout.write('   ');
  const moduleIdMap = await createModules(supabase, projectId, userId);
  console.log(`\n   ✓ ${moduleIdMap.size} modules created\n`);

  // Release
  console.log('4. Creating RC1 release...');
  const releaseId = await createRelease(supabase, projectId, userId);
  console.log(`   ✓ Release ID: ${releaseId}\n`);

  // Test Cases
  const allCases: TestCaseDef[] = [...TEST_CASES_PART1, ...TEST_CASES_PART2, ...TEST_CASES_PART3];
  console.log(`5. Creating ${allCases.length} test cases with steps...`);
  process.stdout.write('   ');

  const allTestCaseIds: string[] = [];
  let created = 0;
  let failed = 0;

  for (const tc of allCases) {
    try {
      const id = await createTestCase(supabase, projectId, moduleIdMap, userId, tc);
      allTestCaseIds.push(id);
      created++;
      if (created % 10 === 0) process.stdout.write(`${created}`);
      else process.stdout.write('.');
    } catch (e) {
      failed++;
      console.warn(`\n   ⚠ Failed: ${tc.title}: ${(e as Error).message}`);
    }
  }
  console.log(`\n   ✓ ${created} test cases created (${failed} failed)\n`);

  // Test Plans
  console.log('6. Creating 9 test plans and linking cases...');
  await createTestPlans(supabase, projectId, releaseId, userId, allTestCaseIds, new Map());
  console.log();

  // Bug Templates
  console.log('7. Creating 10 bug templates...');
  process.stdout.write('   ');
  await createBugTemplates(supabase, projectId, moduleIdMap, userId);
  console.log('\n   ✓ Bug templates created\n');

  // Release Checklist
  console.log('8. Creating release checklist (20 items)...');
  process.stdout.write('   ');
  await createReleaseChecklist(supabase, projectId, releaseId, userId);
  console.log('\n   ✓ Release checklist created\n');

  // Summary
  console.log('═'.repeat(60));
  console.log('✅ SEED COMPLETE — RetailManager V2 RC1 QA Project');
  console.log('═'.repeat(60));
  console.log(`  Project ID  : ${projectId}`);
  console.log(`  Release ID  : ${releaseId}`);
  console.log(`  Modules     : ${moduleIdMap.size}`);
  console.log(`  Test Cases  : ${created}`);
  console.log(`  Test Plans  : ${TEST_PLANS.length}`);
  console.log(`  Bug Templates: ${BUG_TEMPLATES.length}`);
  console.log(`  Release Items: ${RELEASE_CHECKLIST.length}`);
  console.log('');
  console.log('  Module breakdown:');
  for (const [name] of moduleIdMap) {
    const count = allCases.filter(tc => tc.module === name).length;
    console.log(`    ${name.padEnd(20)} ${count} test cases`);
  }
  console.log('');
  console.log('  Open TestHub and navigate to your project to verify.');
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
