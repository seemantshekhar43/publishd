import { describe, expect, it } from 'vitest';
import {
  CONTENT_KINDS,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  SCHEMA_VERSION,
} from './index.js';

describe('schema constants', () => {
  it('exposes both content kinds', () => {
    expect(CONTENT_KINDS).toEqual(['article', 'page']);
  });

  it('exposes the four content types that drive layout', () => {
    expect(CONTENT_TYPES).toEqual(['post', 'note', 'til', 'doc']);
  });

  it('exposes the status lifecycle', () => {
    expect(CONTENT_STATUSES).toEqual(['draft', 'published', 'archived']);
  });

  it('reports a schema version', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
