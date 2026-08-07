// ─── TestCaseGenerator unit tests (Phase 4 M6) ────────────────────────────────
import { describe, it, expect } from 'vitest';
import { TestCaseGenerator } from '@/services/aiTestGenerator/TestCaseGenerator';
import type { ProjectModel, GenerationOptions } from '@/services/aiTestGenerator/types';

const generator = new TestCaseGenerator();

function baseModel(overrides?: Partial<ProjectModel>): ProjectModel {
  return {
    projectType:        'android',
    projectName:        'DemoApp',
    screens:            [],
    apis:               [],
    flows:              [],
    forms:              [],
    sourceFiles:        [],
    analysisConfidence: 0.8,
    ...overrides,
  };
}

const DEFAULT_OPTIONS: GenerationOptions = {
  categories: ['smoke', 'happy_path'],
  maxSuggestions: 5,
};

// ── buildPrompt ────────────────────────────────────────────────────────────────
describe('TestCaseGenerator.buildPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = generator.buildPrompt(baseModel(), DEFAULT_OPTIONS);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('includes project name when provided', () => {
    const prompt = generator.buildPrompt(baseModel({ projectName: 'MyApp' }), DEFAULT_OPTIONS);
    expect(prompt).toContain('MyApp');
  });

  it('includes all requested categories', () => {
    const prompt = generator.buildPrompt(baseModel(), { categories: ['smoke', 'negative', 'boundary'] });
    expect(prompt).toContain('smoke');
    expect(prompt).toContain('negative');
    expect(prompt).toContain('boundary');
  });

  it('includes maxSuggestions limit', () => {
    const prompt = generator.buildPrompt(baseModel(), { ...DEFAULT_OPTIONS, maxSuggestions: 15 });
    expect(prompt).toContain('15');
  });

  it('includes project type', () => {
    const prompt = generator.buildPrompt(baseModel({ projectType: 'react' }), DEFAULT_OPTIONS);
    expect(prompt.toLowerCase()).toContain('react');
  });

  it('lists screen names when present', () => {
    const model = baseModel({
      screens: [{
        name: 'LoginScreen', type: 'activity', elements: [], navigation: [],
      }],
    });
    const prompt = generator.buildPrompt(model, DEFAULT_OPTIONS);
    expect(prompt).toContain('LoginScreen');
  });

  it('mentions API endpoints when present', () => {
    const model = baseModel({
      apis: [{ method: 'POST', path: '/auth/login' }],
    });
    const prompt = generator.buildPrompt(model, DEFAULT_OPTIONS);
    expect(prompt).toContain('/auth/login');
  });
});

// ── parseResponse ──────────────────────────────────────────────────────────────
describe('TestCaseGenerator.parseResponse', () => {
  const SESSION = 'session-001';

  const VALID_RESPONSE = JSON.stringify({
    suggestions: [
      {
        title:              'Login with valid credentials',
        description:        'Verify login succeeds with correct email and password.',
        priority:           'high',
        preconditions:      null,
        tags:               ['auth', 'login'],
        estimated_minutes:  5,
        steps: [
          { step_number: 1, description: 'Launch app', expected_result: 'Login screen appears', notes: null },
          { step_number: 2, description: 'Enter valid email', expected_result: 'Email field populated', notes: null },
        ],
        category:      'happy_path',
        reason:        'Covers the primary login flow.',
        source_files:  ['LoginActivity.kt'],
        confidence:    0.9,
        coverage_area: 'Login Screen',
      },
    ],
  });

  it('parses a valid JSON response into TestSuggestion[]', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions.length).toBe(1);
  });

  it('assigns a non-empty id to each suggestion', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions[0].id.length).toBeGreaterThan(0);
  });

  it('sets status to pending', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions[0].status).toBe('pending');
  });

  it('populates draft title', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions[0].draft.title).toBe('Login with valid credentials');
  });

  it('populates steps', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions[0].draft.steps.length).toBe(2);
  });

  it('populates confidence', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions[0].confidence).toBeCloseTo(0.9);
  });

  it('populates sourceFiles', () => {
    const suggestions = generator.parseResponse(VALID_RESPONSE, SESSION);
    expect(suggestions[0].sourceFiles).toContain('LoginActivity.kt');
  });

  it('returns empty array for malformed JSON', () => {
    const suggestions = generator.parseResponse('not json at all {{{', SESSION);
    expect(suggestions).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(generator.parseResponse('', SESSION)).toEqual([]);
  });

  it('strips markdown code fences before parsing', () => {
    const wrapped = '```json\n' + VALID_RESPONSE + '\n```';
    const suggestions = generator.parseResponse(wrapped, SESSION);
    expect(suggestions.length).toBe(1);
  });

  it('parses JSON without suggestions key gracefully', () => {
    const suggestions = generator.parseResponse('{}', SESSION);
    expect(suggestions).toEqual([]);
  });
});
