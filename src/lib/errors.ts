import { toast } from './toast';

export function handleError(err: unknown, fallback = 'An unexpected error occurred'): string {
  const msg = err instanceof Error ? err.message
    : typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message)
    : typeof err === 'string' ? err : fallback;

  // Clean up common Supabase / PostgREST error messages
  const friendly = msg
    .replace('duplicate key value violates unique constraint', 'A record with this name already exists')
    .replace('violates foreign key constraint', 'Related record not found')
    .replace('new row violates row-level security policy', 'You do not have permission to perform this action')
    .replace('JWT expired', 'Your session has expired. Please log in again.')
    .replace(/\(.*?\)/g, '') // strip SQL detail in parens
    .trim();

  return friendly || fallback;
}

export function toastError(err: unknown, fallback?: string) {
  toast.error(handleError(err, fallback));
}

export function toastSuccess(msg: string) {
  toast.success(msg);
}
