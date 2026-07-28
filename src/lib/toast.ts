// Lightweight toast event bus — consumed by ToastProvider in App.tsx
type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

interface ToastEvent {
  id: number;
  message: string;
  severity: ToastSeverity;
  duration?: number;
}

type Listener = (evt: ToastEvent) => void;

let _id = 0;
const listeners: Set<Listener> = new Set();

export const toast = {
  _subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  _emit(evt: ToastEvent) {
    listeners.forEach(fn => fn(evt));
  },
  success(message: string, duration = 3500) {
    toast._emit({ id: ++_id, message, severity: 'success', duration });
  },
  error(message: string, duration = 5000) {
    toast._emit({ id: ++_id, message, severity: 'error', duration });
  },
  warning(message: string, duration = 4000) {
    toast._emit({ id: ++_id, message, severity: 'warning', duration });
  },
  info(message: string, duration = 3500) {
    toast._emit({ id: ++_id, message, severity: 'info', duration });
  },
};

export type { ToastEvent, ToastSeverity };
