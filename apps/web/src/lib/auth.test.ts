import { describe, expect, it } from 'vitest';
import {
  constantTimeEquals,
  extractBearerToken,
  hashToken,
  resolveClient,
} from './auth.js';

describe('extractBearerToken', () => {
  it('extracts the token from a well-formed header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('returns null for a missing or malformed header', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('abc123')).toBeNull();
    expect(extractBearerToken('Basic abc123')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

describe('constantTimeEquals', () => {
  it('matches identical strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
  });

  it('rejects different strings, including different lengths', () => {
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });
});

describe('resolveClient', () => {
  const cliHash = hashToken('cli-token');
  const obsidianHash = hashToken('obsidian-token');
  const tokenHashesJson = JSON.stringify({ cli: cliHash, obsidian: obsidianHash });

  it('resolves a valid token to its named client', () => {
    expect(resolveClient('cli-token', tokenHashesJson)).toBe('cli');
    expect(resolveClient('obsidian-token', tokenHashesJson)).toBe('obsidian');
  });

  it('returns null for a token that matches nothing', () => {
    expect(resolveClient('wrong-token', tokenHashesJson)).toBeNull();
  });

  it('returns null when PUBLISHD_TOKENS is missing or malformed', () => {
    expect(resolveClient('cli-token', undefined)).toBeNull();
    expect(resolveClient('cli-token', 'not json')).toBeNull();
  });

  it('returns null for a client with no configured token', () => {
    expect(resolveClient('agent-token', tokenHashesJson)).toBeNull();
  });
});
