# TestHub — QA Management Platform

A production-grade, multi-project QA management platform built with React, TypeScript, and Supabase.

## Stack
- **Frontend:** React 18 · TypeScript · Vite · Material UI v5
- **State:** TanStack Query · Zustand
- **Backend:** Supabase (PostgreSQL · Auth · Storage · Realtime)
- **Charts:** Recharts
- **Deploy:** Vercel

## Quick Start

### 1. Clone & Install
```bash
cd TestHub
npm install
```

### 2. Supabase Setup
1. Create a project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → run `supabase/schema.sql` in full
3. In **Authentication → Settings**, enable Email auth

### 3. Environment
```bash
cp .env.example .env
```
Fill in your Supabase URL and anon key from **Project Settings → API**.

### 4. Run
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### 5. First Login
1. Go to **Authentication → Users** in Supabase dashboard
2. Click **Invite user** → enter your email
3. Check email, set password, log in
4. In Supabase SQL Editor: `UPDATE profiles SET role = 'administrator' WHERE email = 'your@email.com';`

## Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel environment variables.

## Architecture

```
src/
├── components/
│   ├── layout/         AppLayout, Sidebar, Header
│   └── common/         StatusChip, SeverityChip, PageHeader, EmptyState, ConfirmDialog
├── features/
│   ├── auth/           Login page
│   ├── dashboard/      Dashboard with charts and stats
│   ├── projects/       Projects list + detail
│   ├── releases/       Release management + readiness score
│   ├── test-cases/     Test case library + execution engine
│   ├── bugs/           Bug tracker with history and comments
│   ├── feature-requests/ Feature voting system
│   ├── reports/        Analytics charts
│   ├── users/          User management (admin only)
│   ├── settings/       Profile and preferences
│   └── notifications/  Realtime notification centre
├── services/           Supabase data access layer
├── hooks/              useAuth, useThemeMode
├── types/              All TypeScript interfaces
└── lib/                supabase client, queryClient, utils
```

## User Roles
| Role | Permissions |
|------|-------------|
| administrator | Full access, user management, delete projects |
| developer | Create/edit releases, update bug status |
| qa_tester | Execute tests, report bugs, create test cases |
| viewer | Read-only access across all modules |

## Key Features
- ✅ Multi-project support (unlimited)
- ✅ Release management with readiness scoring
- ✅ Test case library with step-by-step execution
- ✅ Bug tracking with history, comments, and auto-generated IDs
- ✅ Feature request voting system
- ✅ Role-based access control (RBAC)
- ✅ Dark / Light mode
- ✅ Responsive (desktop, tablet, mobile)
- ✅ Realtime notifications
- ✅ PostgreSQL RLS for data isolation
- ✅ Analytics charts (bug severity, test progress, trends)
- ✅ Release readiness calculator (SQL function)
