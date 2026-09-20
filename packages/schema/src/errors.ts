/**
 * Readable validation errors: a field path plus the expected shape, never a
 * raw ZodError dump. See docs/content-schema.md section 7 for the contract.
 */

export interface SchemaIssue {
  /** Dot-separated path within the frontmatter object, e.g. "slug" or "author.name". */
  path: string;
  /** Human-readable description of what was expected. */
  message: string;
}

export class SchemaValidationError extends Error {
  readonly issues: readonly SchemaIssue[];

  constructor(issues: readonly SchemaIssue[]) {
    super(formatIssues(issues));
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

function formatIssues(issues: readonly SchemaIssue[]): string {
  return issues
    .map((issue) => `✗ frontmatter.${issue.path}: ${issue.message}`)
    .join('\n');
}
