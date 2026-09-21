import { describe, expect, it, vi } from 'vitest';
import { pollUntilLive } from './poll.js';

describe('pollUntilLive', () => {
  it('resolves as soon as the URL responds ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(
      pollUntilLive('https://publish.example.test/hello', fetchImpl, {
        attempts: 3,
        delayMs: 0,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('not yet'))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await pollUntilLive('https://publish.example.test/hello', fetchImpl, {
      attempts: 5,
      delayMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      pollUntilLive('https://publish.example.test/hello', fetchImpl, {
        attempts: 2,
        delayMs: 0,
      }),
    ).rejects.toThrow(/timed out/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('sends no extra headers by default', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await pollUntilLive('https://publish.example.test/hello', fetchImpl, {
      attempts: 1,
      delayMs: 0,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://publish.example.test/hello', {
      method: 'HEAD',
      headers: {},
    });
  });

  it('forwards the given headers on every request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await pollUntilLive(
      'https://publish.example.test/hello',
      fetchImpl,
      { attempts: 1, delayMs: 0 },
      { 'x-vercel-protection-bypass': 'bypass-secret' },
    );

    expect(fetchImpl).toHaveBeenCalledWith('https://publish.example.test/hello', {
      method: 'HEAD',
      headers: { 'x-vercel-protection-bypass': 'bypass-secret' },
    });
  });
});
