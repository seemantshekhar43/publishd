import { describe, expect, it, vi } from 'vitest';
import type { Logger } from './publish.js';
import { runDoctor } from './doctor.js';

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

describe('runDoctor', () => {
  it('reports a missing config with an actionable message', async () => {
    const log = buildLogger();

    const exitCode = await runDoctor({
      profile: { error: 'no profile "default" in ~/.config/publishd/config.toml' },
      fetchImpl: vi.fn(),
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('no profile "default"');
    expect(log.lines.some((line) => line.includes('publishd init'))).toBe(true);
  });

  it('reports an unreachable endpoint with an actionable message', async () => {
    const log = buildLogger();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const exitCode = await runDoctor({
      profile: { endpoint: 'https://example.test', token: 'tok' },
      fetchImpl,
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('unreachable');
    expect(log.errors[0]).toContain('ECONNREFUSED');
  });

  it('reports a rejected token with an actionable message', async () => {
    const log = buildLogger();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    const exitCode = await runDoctor({
      profile: { endpoint: 'https://example.test', token: 'bad-token' },
      fetchImpl,
      log,
    });

    expect(exitCode).toBe(1);
    expect(log.errors[0]).toContain('rejected');
  });

  it('reports success when config, endpoint, and token all check out', async () => {
    const log = buildLogger();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    const exitCode = await runDoctor({
      profile: { endpoint: 'https://example.test', token: 'tok' },
      fetchImpl,
      log,
    });

    expect(exitCode).toBe(0);
    expect(log.errors).toEqual([]);
  });
});
