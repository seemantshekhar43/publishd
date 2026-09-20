/**
 * The article frontmatter contract - the keystone of the project.
 *
 * Imported by three consumers (apps/cli, apps/web's ingest route, and the
 * site build), which is the entire point: a frontmatter field is declared
 * exactly once, here. See docs/architecture.md section 3 and
 * docs/content-schema.md sections 1-4 and 7 for the full contract.
 */

import { z } from 'zod';
import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  type ContentStatus,
  type ContentType,
} from './constants.js';
import { SchemaValidationError, type SchemaIssue } from './errors.js';
import {
  deriveSlug,
  hasValidSlugShape,
  isReservedSlug,
  SLUG_MAX_LENGTH,
} from './slug.js';

/** The raw shape an author (or an untrusted request body) may provide. */
export interface ArticleFrontmatterInput {
  title: string;
  slug?: string;
  date?: string;
  updated?: string;
  status?: ContentStatus;
  type?: ContentType;
  tags?: string[];
  summary?: string;
  canonical?: string;
  publishAt?: string;
  listed?: boolean;
}

/** The fully-resolved shape after defaults and derivation are applied. */
export interface ArticleFrontmatter {
  title: string;
  slug: string;
  date: string;
  updated?: string;
  status: ContentStatus;
  type: ContentType;
  tags: string[];
  summary?: string;
  canonical?: string;
  publishAt?: string;
  listed: boolean;
}

const TITLE_MAX_LENGTH = 200;
const SUMMARY_MAX_LENGTH = 300;

/**
 * Loose type/shape check only - every business rule (slug derivation,
 * reserved slugs, enum membership, length limits) is enforced separately in
 * `parseArticleFrontmatter` so the error messages stay under our control
 * rather than falling out of zod's generic issue formatting.
 */
const shapeSchema = z.object({
  title: z.unknown(),
  slug: z.unknown().optional(),
  date: z.unknown().optional(),
  updated: z.unknown().optional(),
  status: z.unknown().optional(),
  type: z.unknown().optional(),
  tags: z.unknown().optional(),
  summary: z.unknown().optional(),
  canonical: z.unknown().optional(),
  publishAt: z.unknown().optional(),
  listed: z.unknown().optional(),
});

const isoDateSchema = z.iso.date();
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const urlSchema = z.url();

/**
 * Validates and normalises raw article frontmatter, filling in every default
 * per docs/content-schema.md section 1. Throws `SchemaValidationError` -
 * never a raw ZodError - naming every offending field in one pass.
 */
export function parseArticleFrontmatter(input: unknown): ArticleFrontmatter {
  const shape = shapeSchema.safeParse(input);
  if (!shape.success) {
    throw new SchemaValidationError(
      shape.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }

  const raw = shape.data;
  const issues: SchemaIssue[] = [];

  const title = validateTitle(raw.title, issues);
  const slug = validateSlug(raw.slug, title, issues);
  const date = validateDate(raw.date, issues);
  const updated = validateOptionalDate(raw.updated, 'updated', issues);
  const status = validateStatus(raw.status, issues);
  const type = validateType(raw.type, issues);
  const tags = validateTags(raw.tags, issues);
  const summary = validateSummary(raw.summary, issues);
  const canonical = validateCanonical(raw.canonical, issues);
  const publishAt = validatePublishAt(raw.publishAt, issues);
  const listed = validateListed(raw.listed, issues);

  if (issues.length > 0) {
    throw new SchemaValidationError(issues);
  }

  return {
    title: title as string,
    slug: slug as string,
    date: date as string,
    ...(updated !== undefined ? { updated } : {}),
    status: status as ContentStatus,
    type: type as ContentType,
    tags: tags as string[],
    ...(summary !== undefined ? { summary } : {}),
    ...(canonical !== undefined ? { canonical } : {}),
    ...(publishAt !== undefined ? { publishAt } : {}),
    listed: listed as boolean,
  };
}

function validateTitle(value: unknown, issues: SchemaIssue[]): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({
      path: 'title',
      message: 'expected a non-empty string, got ' + describe(value),
    });
    return undefined;
  }
  if (value.length > TITLE_MAX_LENGTH) {
    issues.push({
      path: 'title',
      message: `expected at most ${TITLE_MAX_LENGTH} characters, got ${value.length}`,
    });
    return undefined;
  }
  return value;
}

function validateSlug(
  value: unknown,
  title: string | undefined,
  issues: SchemaIssue[],
): string | undefined {
  if (value === undefined) {
    if (title === undefined) {
      return undefined;
    }
    const derived = deriveSlug(title);
    if (!hasValidSlugShape(derived)) {
      issues.push({
        path: 'slug',
        message: `title "${title}" does not derive to a valid slug; provide an explicit slug`,
      });
      return undefined;
    }
    return derived;
  }
  if (typeof value !== 'string') {
    issues.push({ path: 'slug', message: 'expected a string, got ' + describe(value) });
    return undefined;
  }
  if (isReservedSlug(value)) {
    issues.push({
      path: 'slug',
      message: `"${value}" is reserved and collides with the /${value} route`,
    });
    return undefined;
  }
  if (!hasValidSlugShape(value)) {
    issues.push({
      path: 'slug',
      message: `"${value}" is not a valid slug (lowercase letters, digits, hyphens, max ${SLUG_MAX_LENGTH} characters)`,
    });
    return undefined;
  }
  return value;
}

/**
 * A YAML frontmatter parser (gray-matter/js-yaml) auto-casts an unquoted
 * date like `date: 2026-09-20` into a native `Date`, not a string - and
 * that unquoted form is the normal way to write one. Normalise it to
 * YYYY-MM-DD before validating, rather than rejecting it.
 */
function normalizeDateLike(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function validateDate(value: unknown, issues: SchemaIssue[]): string | undefined {
  if (value === undefined) {
    return new Date().toISOString().slice(0, 10);
  }
  const normalized = normalizeDateLike(value);
  if (typeof normalized !== 'string' || !isoDateSchema.safeParse(normalized).success) {
    issues.push({
      path: 'date',
      message: `expected an ISO date (YYYY-MM-DD), got ${describe(value)}`,
    });
    return undefined;
  }
  return normalized;
}

function validateOptionalDate(
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeDateLike(value);
  if (typeof normalized !== 'string' || !isoDateSchema.safeParse(normalized).success) {
    issues.push({
      path,
      message: `expected an ISO date (YYYY-MM-DD), got ${describe(value)}`,
    });
    return undefined;
  }
  return normalized;
}

function validateStatus(
  value: unknown,
  issues: SchemaIssue[],
): ContentStatus | undefined {
  if (value === undefined) {
    return 'draft';
  }
  if (!isOneOf(value, CONTENT_STATUSES)) {
    issues.push({
      path: 'status',
      message: `expected one of ${formatEnum(CONTENT_STATUSES)}, got ${describe(value)}`,
    });
    return undefined;
  }
  return value;
}

function validateType(value: unknown, issues: SchemaIssue[]): ContentType | undefined {
  if (value === undefined) {
    return 'post';
  }
  if (!isOneOf(value, CONTENT_TYPES)) {
    issues.push({
      path: 'type',
      message: `expected one of ${formatEnum(CONTENT_TYPES)}, got ${describe(value)}`,
    });
    return undefined;
  }
  return value;
}

function validateTags(value: unknown, issues: SchemaIssue[]): string[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    issues.push({
      path: 'tags',
      message: 'expected an array of strings, got ' + describe(value),
    });
    return undefined;
  }
  return value;
}

function validateSummary(value: unknown, issues: SchemaIssue[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.push({
      path: 'summary',
      message: 'expected a string, got ' + describe(value),
    });
    return undefined;
  }
  if (value.length > SUMMARY_MAX_LENGTH) {
    issues.push({
      path: 'summary',
      message: `expected at most ${SUMMARY_MAX_LENGTH} characters, got ${value.length}`,
    });
    return undefined;
  }
  return value;
}

function validateCanonical(value: unknown, issues: SchemaIssue[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !urlSchema.safeParse(value).success) {
    issues.push({
      path: 'canonical',
      message: `expected a valid URL, got ${describe(value)}`,
    });
    return undefined;
  }
  return value;
}

function validatePublishAt(value: unknown, issues: SchemaIssue[]): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (
    typeof normalized !== 'string' ||
    !isoDateTimeSchema.safeParse(normalized).success
  ) {
    issues.push({
      path: 'publishAt',
      message: `expected an ISO datetime (e.g. 2026-09-25T09:00:00Z), got ${describe(value)}`,
    });
    return undefined;
  }
  return normalized;
}

function validateListed(value: unknown, issues: SchemaIssue[]): boolean | undefined {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== 'boolean') {
    issues.push({
      path: 'listed',
      message: 'expected a boolean, got ' + describe(value),
    });
    return undefined;
  }
  return value;
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  options: T,
): value is T[number] {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function formatEnum(options: readonly string[]): string {
  return options.map((option) => `"${option}"`).join(' | ');
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  return JSON.stringify(value);
}
