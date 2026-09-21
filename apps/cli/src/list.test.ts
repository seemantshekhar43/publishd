import { describe, expect, it, vi } from 'vitest';
import type { Logger } from './publish.js';
import { runList } from './list.js';

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

describe('runList', () => {
  it('prints every article with its status, date, slug, and url', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          articles: [
            {
              slug: 'hello',
              title: 'Hello',
              status: 'published',
              date: '2026-09-20',
              url: 'https://example.test/hello',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const log = buildLogger();

    const exitCode = await runList(
      {},
      { fetchImpl, endpoint: 'https://example.test', token: 'tok', log },
    );

    expect(exitCode).toBe(0);
    expect(log.lines[0]).toContain('hello');
    expect(log.lines[0]).toContain('published');
    expect(log.lines[0]).toContain('https://example.test/hello');
  });

  it('prints a friendly message when nothing is published', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ articles: [] }), { status: 200 }));
    const log = buildLogger();

    const exitCode = await runList(
      {},
      { fetchImpl, endpoint: 'https://example.test', token: 'tok', log },
    );

    expect(exitCode).toBe(0);
    expect(log.lines).toEqual(['Nothing published yet.']);
  });

  it('passes a status filter through as a query parameter', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ articles: [] }), { status: 200 }));

    await runList(
      { status: 'draft' },
      { fetchImpl, endpoint: 'https://example.test', token: 'tok', log: buildLogger() },
    );

    const requestedUrl = vi.mocked(fetchImpl).mock.calls[0]?.[0] as URL;
    expect(requestedUrl.toString()).toBe('https://example.test/api/list?status=draft');
  });

  it('sends the bearer token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ articles: [] }), { status: 200 }));

    await runList(
      {},
      {
        fetchImpl,
        endpoint: 'https://example.test',
        token: 'secret-token',
        log: buildLogger(),
      },
    );

    const init = vi.mocked(fetchImpl).mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
  });

  it('reports a failed request and returns exit code 1', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid token' }), { status: 401 }),
      );
    const log = buildLogger();

    const exitCode = await runList(
      {},
      { fetchImpl, endpoint: 'https://example.test', token: 'tok', log },
    );

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('invalid token');
  });
});
