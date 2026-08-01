import { supabase } from '@/lib/supabase';
import type { RecordingSession, TimelineEvent, ScreenshotRecord } from '@/features/recorder/types';

export const recorderService = {
  // ── Create ──────────────────────────────────────────────────────────────────

  async createRecording(session: Omit<RecordingSession, 'id' | 'screenshotCount'>): Promise<string> {
    const { data, error } = await supabase
      .from('execution_recordings')
      .insert({
        test_session_id:  session.testSessionId  ?? null,
        release_id:       session.releaseId       ?? null,
        build_version:    session.buildVersion    ?? null,
        device_name:      session.deviceName,
        device_os:        session.deviceOs        ?? null,
        tester_id:        session.testerId,
        runner_id:        session.runnerId        ?? null,
        local_folder:     session.localFolder,
        status:           'ready',
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  },

  // ── Status updates ───────────────────────────────────────────────────────────

  async updateStatus(id: string, status: string, extra?: Record<string, unknown>): Promise<void> {
    const { error } = await supabase
      .from('execution_recordings')
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq('id', id);
    if (error) throw error;
  },

  async onStart(id: string): Promise<void> {
    await this.updateStatus(id, 'recording', {
      started_at: new Date().toISOString(),
    });
  },

  async onPause(id: string): Promise<void> {
    await this.updateStatus(id, 'paused', {
      paused_at: new Date().toISOString(),
    });
  },

  async onResume(id: string, totalPausedMs: number): Promise<void> {
    await this.updateStatus(id, 'recording', {
      paused_duration_ms: totalPausedMs,
      paused_at: null,
    });
  },

  async onStop(id: string, durationMs: number, pausedMs: number): Promise<void> {
    await this.updateStatus(id, 'stopping', {
      stopped_at:        new Date().toISOString(),
      duration_ms:       durationMs,
      paused_duration_ms: pausedMs,
    });
  },

  async onSaving(id: string): Promise<void> {
    await this.updateStatus(id, 'saving');
  },

  async finalize(id: string, payload: {
    screenshotCount: number;
    timelineEventCount: number;
    videoPath?: string;
    videoSizeBytes?: number;
    videoDurationMs?: number;
    videoChecksum?: string;
    logcatPath?: string;
    logcatSizeBytes?: number;
  }): Promise<void> {
    await this.updateStatus(id, 'completed', {
      screenshot_count:    payload.screenshotCount,
      timeline_event_count: payload.timelineEventCount,
      video_path:          payload.videoPath          ?? null,
      video_size_bytes:    payload.videoSizeBytes     ?? null,
      video_duration_ms:   payload.videoDurationMs    ?? null,
      video_checksum:      payload.videoChecksum      ?? null,
      logcat_path:         payload.logcatPath         ?? null,
      logcat_size_bytes:   payload.logcatSizeBytes    ?? null,
    });
  },

  async onError(id: string, message: string): Promise<void> {
    await this.updateStatus(id, 'error', { error_message: message });
  },

  // ── Cancel — hard delete, no DB record remains ──────────────────────────────

  async cancel(id: string): Promise<void> {
    const { error } = await supabase
      .from('execution_recordings')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // ── Timeline ─────────────────────────────────────────────────────────────────

  async flushTimeline(recordingId: string, events: TimelineEvent[]): Promise<void> {
    if (events.length === 0) return;
    const { error } = await supabase.from('execution_timeline_events').insert(
      events.map(e => ({
        recording_id: recordingId,
        event_type:   e.type,
        description:  e.description,
        offset_ms:    e.offsetMs,
        metadata:     e.metadata ?? null,
      }))
    );
    if (error) throw error;
  },

  // ── Screenshots ──────────────────────────────────────────────────────────────

  async addScreenshot(recordingId: string, s: Omit<ScreenshotRecord, 'capturedAt'>): Promise<void> {
    const { error } = await supabase.from('execution_screenshots').insert({
      recording_id:    recordingId,
      screenshot_type: s.type,
      local_path:      s.localPath,
      offset_ms:       s.offsetMs,
    });
    if (error) throw error;
  },

  // ── Queries ──────────────────────────────────────────────────────────────────

  async get(id: string) {
    const { data, error } = await supabase
      .from('execution_recordings')
      .select(`
        *,
        tester:profiles!tester_id(id, full_name, avatar_url),
        release:releases(id, name, version),
        timeline:execution_timeline_events(*),
        screenshots:execution_screenshots(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async listBySession(testSessionId: string) {
    const { data, error } = await supabase
      .from('execution_recordings')
      .select('*, tester:profiles!tester_id(id, full_name, avatar_url)')
      .eq('test_session_id', testSessionId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async listByTester(testerId: string) {
    const { data, error } = await supabase
      .from('execution_recordings')
      .select('*, release:releases(id, name, version)')
      .eq('tester_id', testerId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  },
};
