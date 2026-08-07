// ─── ContextBuilder tests (Phase 4 M8) ────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { ContextBuilder }  from '../../services/failureAnalysis/ContextBuilder';
import type {
  ExecutionSummary, ClassificationResult, Evidence, PreviousFailure,
} from '../../services/failureAnalysis/FailureAnalysisTypes';

function makeSummary(overrides: Partial<ExecutionSummary> = {}): ExecutionSummary {
  return {
    runId: 'run-1', testCaseName: 'Login test', status: 'failed',
    totalSteps: 5, passedSteps: 3, failedSteps: 2, skippedSteps: 0,
    duration_ms: 3500, startedAt: '2026-08-07T10:00:00Z',
    steps: [], failedStepList: [], assertions: [], healingAttempts: [],
    ...overrides,
  };
}

function makeClassification(category: ClassificationResult['category'] = 'locator_failure'): ClassificationResult {
  return { category, confidence: 0.9, signals: ['Element not found'] };
}

const builder = new ContextBuilder();
const NO_EVIDENCE: Evidence[] = [];
const NO_PREVIOUS: PreviousFailure[] = [];

describe('ContextBuilder', () => {
  it('build() returns context with correct runId', () => {
    const ctx = builder.build(makeSummary(), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    expect(ctx.runId).toBe('run-1');
  });

  it('build() returns context with testCaseName', () => {
    const ctx = builder.build(makeSummary({ testCaseName: 'My Test' }), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    expect(ctx.testCaseName).toBe('My Test');
  });

  it('build() uses "Unknown test case" when testCaseName is absent', () => {
    const ctx = builder.build(makeSummary({ testCaseName: undefined }), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    expect(ctx.testCaseName).toBe('Unknown test case');
  });

  it('build() limits previousFailures to 5', () => {
    const previous: PreviousFailure[] = Array.from({ length: 10 }, (_, i) => ({
      runId: `r${i}`, category: 'unknown' as const, createdAt: '', resolved: false,
    }));
    const ctx = builder.build(makeSummary(), makeClassification(), NO_EVIDENCE, previous);
    expect(ctx.previousFailures.length).toBeLessThanOrEqual(5);
  });

  it('buildPrompt() includes the run ID', () => {
    const ctx    = builder.build(makeSummary(), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('run-1');
  });

  it('buildPrompt() includes the test case name', () => {
    const ctx    = builder.build(makeSummary({ testCaseName: 'SmokeTest' }), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('SmokeTest');
  });

  it('buildPrompt() includes classification category', () => {
    const ctx    = builder.build(makeSummary(), makeClassification('crash'), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('crash');
  });

  it('buildPrompt() includes failed step errors', () => {
    const summary = makeSummary({
      failedStepList: [{
        stepId: 's1', stepNumber: 3, action: 'tap',
        selector: 'com.example:id/btn', status: 'failed',
        duration_ms: 100, error: 'NoSuchElementException: btn not found',
      }],
    });
    const ctx    = builder.build(summary, makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('NoSuchElementException');
    expect(prompt).toContain('Step 3');
  });

  it('buildPrompt() includes failed assertion details', () => {
    const summary = makeSummary({
      assertions: [{
        id: 'a1', stepNumber: 2, assertionKind: 'equals', status: 'FAIL',
        expected: 'Welcome Home', actual: 'Login', message: 'Text does not match',
      }],
    });
    const ctx    = builder.build(summary, makeClassification('assertion_failure'), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('Welcome Home');
    expect(prompt).toContain('Text does not match');
  });

  it('buildPrompt() instructs Claude to return JSON', () => {
    const ctx    = builder.build(makeSummary(), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('rootCause');
    expect(prompt).toContain('confidence');
  });

  it('buildPrompt() includes healing attempts when present', () => {
    const summary = makeSummary({
      healingAttempts: [{
        stepId: 's1', stepNumber: 2, outcome: 'healed',
        strategyUsed: 'button_text_changed', originalLocator: 'Login',
      }],
    });
    const ctx    = builder.build(summary, makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('button_text_changed');
  });

  it('buildPrompt() includes evidence content', () => {
    const evidence: Evidence[] = [{
      id: 'e1', type: 'exception', stepNumber: 3,
      content: 'NullPointerException at line 42',
    }];
    const ctx    = builder.build(makeSummary(), makeClassification(), evidence, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('NullPointerException');
  });

  it('buildPrompt() includes previous failure history', () => {
    const previous: PreviousFailure[] = [{
      runId: 'prev-run-1', category: 'locator_failure',
      createdAt: '2026-08-01T10:00:00Z', resolved: false,
    }];
    const ctx    = builder.build(makeSummary(), makeClassification(), NO_EVIDENCE, previous);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('locator_failure');
  });

  it('buildPrompt() shows "no previous failures" when history is empty', () => {
    const ctx    = builder.build(makeSummary(), makeClassification(), NO_EVIDENCE, NO_PREVIOUS);
    const prompt = builder.buildPrompt(ctx);
    expect(prompt).toContain('no previous failures');
  });
});
