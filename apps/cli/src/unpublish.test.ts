import { describe, expect, it, vi } from 'vitest';
import type { Logger } from './publish.js';
import { runUnpublish } from './unpublish.js';

function buildLogger(): Logger & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    info: (message) => lines.push(message),
    warn: () => {},
    error: (message) => errors.push(message),
  };
}

describe('runUnpublish', () => {
  it('POSTs the slug and prints confirmation on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ slug: 'hello', status: 'archived' }), {
        status: 200,
      }),
    );
    const log = buildLogger();

    const exitCode = await runUnpublish('hello', {
      fetchImpl,
      endpoint: 'https://example.test',
      token: 'tok',
      log,
    });

    expect(exitCode).toBe(0);
    expect(log.lines).toEqual(['hello: archived']);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/api/unpublish',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ slug: 'hello' }),
      }),
    );
  });

  it('reports a 404 for an unknown slug and returns exit code 1', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'no article with slug "missing"' }), {
        status: 404,
      }),
    );
    const log = buildLogger();

    const exitCode = await runUnpublish('missing', {
      fetchImpl,
      endpoint: 'https://example.test',
      token: 'tok',
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('no article with slug "missing"');
  });
});
