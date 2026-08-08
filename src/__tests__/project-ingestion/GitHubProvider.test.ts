import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '../../services/projectIngestion/providers/GitHubProjectSourceProvider.js';

describe('GitHubProjectSourceProvider', () => {
  describe('parseGitHubUrl', () => {
    it('parses standard GitHub URL', () => {
      const r = parseGitHubUrl('https://github.com/facebook/react');
      expect(r).not.toBeNull();
      expect(r!.owner).toBe('facebook');
      expect(r!.repo).toBe('react');
    });
    it('parses URL with branch', () => {
      const r = parseGitHubUrl('https://github.com/owner/repo/tree/main');
      expect(r!.owner).toBe('owner');
      expect(r!.repo).toBe('repo');
      expect(r!.ref).toBe('main');
    });
    it('strips .git suffix', () => {
      const r = parseGitHubUrl('https://github.com/owner/repo.git');
      expect(r!.repo).toBe('repo');
    });
    it('parses URL without protocol', () => {
      const r = parseGitHubUrl('github.com/owner/repo');
      expect(r!.owner).toBe('owner');
      expect(r!.repo).toBe('repo');
    });
    it('returns null for non-GitHub URL', () => {
      expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
    });
    it('returns null for invalid URL', () => {
      expect(parseGitHubUrl('not-a-url')).toBeNull();
    });
    it('returns null for github.com with only owner', () => {
      expect(parseGitHubUrl('https://github.com/facebook')).toBeNull();
    });
  });
});
