import { useState, useEffect } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { toast, type ToastEvent } from '@/lib/toast';

export function ToastProvider() {
  const [queue, setQueue] = useState<ToastEvent[]>([]);
  const [current, setCurrent] = useState<ToastEvent | null>(null);

  useEffect(() => {
    const unsub = toast._subscribe(evt => setQueue(q => [...q, evt]));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(q => q.slice(1));
    }
  }, [current, queue]);

  const handleClose = (_: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setCurrent(null);
  };

  return (
    <Snackbar
      open={!!current}
      autoHideDuration={current?.duration ?? 4000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={() => setCurrent(null)}
        severity={current?.severity ?? 'info'}
        variant="filled"
        sx={{ minWidth: 300, boxShadow: 6 }}
      >
        {current?.message}
      </Alert>
    </Snackbar>
  );
}
