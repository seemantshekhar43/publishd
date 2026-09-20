import { describe, expect, it } from 'vitest';
import { deriveSlug, hasValidSlugShape, isReservedSlug, RESERVED_SLUGS } from './slug.js';

describe('deriveSlug', () => {
  it('matches the docs/content-schema.md section 3 examples', () => {
    expect(deriveSlug('Running Kubernetes on a Beelink cluster')).toBe(
      'running-kubernetes-on-a-beelink-cluster',
    );
    expect(deriveSlug('Why I left Docker Compose (finally)')).toBe(
      'why-i-left-docker-compose-finally',
    );
  });

  it('lowercases and strips accents', () => {
    expect(deriveSlug('Café Über Alles')).toBe('cafe-uber-alles');
  });

  it('collapses runs of non-alphanumerics into a single hyphen', () => {
    expect(deriveSlug('one -- two___three!!!four')).toBe('one-two-three-four');
  });

  it('trims leading and trailing hyphens', () => {
    expect(deriveSlug('  --Hello World--  ')).toBe('hello-world');
  });

  it('truncates to 80 characters on a word boundary', () => {
    const title =
      'This title is deliberately long enough that it must be truncated at eighty characters on a word boundary rather than mid word';
    const slug = deriveSlug(title);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug).toBe(
      'this-title-is-deliberately-long-enough-that-it-must-be-truncated-at-eighty',
    );
  });
});

describe('hasValidSlugShape', () => {
  it('accepts lowercase alphanumerics joined by single hyphens', () => {
    expect(hasValidSlugShape('k8s-beelink-cluster')).toBe(true);
    expect(hasValidSlugShape('a')).toBe(true);
    expect(hasValidSlugShape('a1')).toBe(true);
  });

  it('rejects uppercase, spaces, and double hyphens', () => {
    expect(hasValidSlugShape('My Post')).toBe(false);
    expect(hasValidSlugShape('Some-Slug')).toBe(false);
    expect(hasValidSlugShape('double--hyphen')).toBe(false);
  });

  it('rejects leading or trailing hyphens and empty strings', () => {
    expect(hasValidSlugShape('-leading')).toBe(false);
    expect(hasValidSlugShape('trailing-')).toBe(false);
    expect(hasValidSlugShape('')).toBe(false);
  });

  it('rejects a slug over 80 characters', () => {
    expect(hasValidSlugShape('a'.repeat(81))).toBe(false);
    expect(hasValidSlugShape('a'.repeat(80))).toBe(true);
  });
});

describe('isReservedSlug', () => {
  it.each(RESERVED_SLUGS)('rejects the reserved slug "%s"', (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });

  it('accepts a slug that is not reserved', () => {
    expect(isReservedSlug('k8s-beelink-cluster')).toBe(false);
  });
});
