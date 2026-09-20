import { describe, expect, it } from 'vitest';
import { parseArticleFrontmatter } from './article.js';
import { RESERVED_SLUGS } from './slug.js';
import { SchemaValidationError } from './errors.js';

describe('parseArticleFrontmatter - defaults', () => {
  it('accepts a frontmatter block with only title set', () => {
    const result = parseArticleFrontmatter({ title: 'Hello world' });
    expect(result.title).toBe('Hello world');
    expect(result.slug).toBe('hello-world');
    expect(result.status).toBe('draft');
    expect(result.type).toBe('post');
    expect(result.tags).toEqual([]);
    expect(result.listed).toBe(true);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.updated).toBeUndefined();
    expect(result.summary).toBeUndefined();
    expect(result.canonical).toBeUndefined();
    expect(result.publishAt).toBeUndefined();
  });

  it('rejects a missing title', () => {
    expect(() => parseArticleFrontmatter({})).toThrow(SchemaValidationError);
  });

  it('preserves every explicitly provided field', () => {
    const result = parseArticleFrontmatter({
      title: 'Running Kubernetes on a Beelink cluster',
      slug: 'k8s-beelink-cluster',
      date: '2026-09-20',
      updated: '2026-09-21',
      status: 'published',
      type: 'til',
      tags: ['homelab', 'kubernetes'],
      summary: 'Three mini PCs, one control plane.',
      canonical: 'https://example.com/original',
      publishAt: '2026-09-25T09:00:00Z',
      listed: false,
    });
    expect(result).toEqual({
      title: 'Running Kubernetes on a Beelink cluster',
      slug: 'k8s-beelink-cluster',
      date: '2026-09-20',
      updated: '2026-09-21',
      status: 'published',
      type: 'til',
      tags: ['homelab', 'kubernetes'],
      summary: 'Three mini PCs, one control plane.',
      canonical: 'https://example.com/original',
      publishAt: '2026-09-25T09:00:00Z',
      listed: false,
    });
  });
});

describe('parseArticleFrontmatter - slug derivation', () => {
  it('derives the slug from the title when absent', () => {
    const result = parseArticleFrontmatter({
      title: 'Why I left Docker Compose (finally)',
    });
    expect(result.slug).toBe('why-i-left-docker-compose-finally');
  });

  it('rejects a title that derives to an empty slug', () => {
    try {
      parseArticleFrontmatter({ title: '!!!' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      const schemaError = error as SchemaValidationError;
      expect(schemaError.issues).toContainEqual({
        path: 'slug',
        message: 'title "!!!" does not derive to a valid slug; provide an explicit slug',
      });
    }
  });

  it('rejects a slug with an invalid shape', () => {
    try {
      parseArticleFrontmatter({ title: 'x', slug: 'My Post' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaValidationError);
      const schemaError = error as SchemaValidationError;
      expect(schemaError.issues).toContainEqual({
        path: 'slug',
        message:
          '"My Post" is not a valid slug (lowercase letters, digits, hyphens, max 80 characters)',
      });
    }
  });

  it.each(RESERVED_SLUGS)(
    'rejects the reserved slug "%s" naming the collision',
    (slug) => {
      try {
        parseArticleFrontmatter({ title: 'x', slug });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        const schemaError = error as SchemaValidationError;
        expect(schemaError.issues).toContainEqual({
          path: 'slug',
          message: `"${slug}" is reserved and collides with the /${slug} route`,
        });
      }
    },
  );
});

describe('parseArticleFrontmatter - validation', () => {
  it('rejects a title over 200 characters', () => {
    expect(() => parseArticleFrontmatter({ title: 'a'.repeat(201) })).toThrow(
      SchemaValidationError,
    );
  });

  it('rejects an invalid status naming the field and expected values', () => {
    try {
      parseArticleFrontmatter({ title: 'x', status: 'live' });
      expect.unreachable();
    } catch (error) {
      const schemaError = error as SchemaValidationError;
      expect(schemaError.issues).toContainEqual({
        path: 'status',
        message: 'expected one of "draft" | "published" | "archived", got "live"',
      });
    }
  });

  it('rejects an invalid type naming the field and expected values', () => {
    try {
      parseArticleFrontmatter({ title: 'x', type: 'article' });
      expect.unreachable();
    } catch (error) {
      const schemaError = error as SchemaValidationError;
      expect(schemaError.issues).toContainEqual({
        path: 'type',
        message: 'expected one of "post" | "note" | "til" | "doc", got "article"',
      });
    }
  });

  it('rejects a summary over 300 characters', () => {
    expect(() =>
      parseArticleFrontmatter({ title: 'x', summary: 'a'.repeat(301) }),
    ).toThrow(SchemaValidationError);
  });

  it('rejects a non-URL canonical', () => {
    expect(() => parseArticleFrontmatter({ title: 'x', canonical: 'not-a-url' })).toThrow(
      SchemaValidationError,
    );
  });

  it('rejects a malformed publishAt', () => {
    expect(() =>
      parseArticleFrontmatter({ title: 'x', publishAt: 'next tuesday' }),
    ).toThrow(SchemaValidationError);
  });

  it('rejects non-string tags', () => {
    expect(() => parseArticleFrontmatter({ title: 'x', tags: ['ok', 42] })).toThrow(
      SchemaValidationError,
    );
  });

  it('rejects a non-boolean listed', () => {
    expect(() => parseArticleFrontmatter({ title: 'x', listed: 'yes' })).toThrow(
      SchemaValidationError,
    );
  });

  it('reports every invalid field in one pass, not just the first', () => {
    try {
      parseArticleFrontmatter({
        title: 'x',
        status: 'live',
        type: 'article',
        listed: 'yes',
      });
      expect.unreachable();
    } catch (error) {
      const schemaError = error as SchemaValidationError;
      const paths = schemaError.issues.map((issue) => issue.path);
      expect(paths).toEqual(['status', 'type', 'listed']);
    }
  });

  it('formats the thrown error message as field-path lines, not a ZodError dump', () => {
    try {
      parseArticleFrontmatter({ title: 'x', type: 'article' });
      expect.unreachable();
    } catch (error) {
      const schemaError = error as SchemaValidationError;
      expect(schemaError.message).not.toMatch(/ZodError/);
      expect(schemaError.message).toMatch(/^✗ frontmatter\.type:/);
    }
  });
});
