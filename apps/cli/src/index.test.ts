/**
 * `createPrompt` exists because `readline`'s own `.question()`, called
 * once per question, drops answers when stdin is piped rather than a real
 * terminal - see the doc comment on `createPrompt` in index.ts. This is a
 * regression test for that: piped multi-line input must resolve every
 * question, not just the first.
 */
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import { describe, expect, it } from 'vitest';
import { createPrompt } from './index.js';

describe('createPrompt', () => {
  it('resolves every question in order from piped input delivered all at once', async () => {
    const input = new PassThrough();
    const rl = createInterface({ input });
    const prompt = createPrompt(rl);

    input.write('one\ntwo\nthree\n');
    input.end();

    await expect(prompt('A: ')).resolves.toBe('one');
    await expect(prompt('B: ')).resolves.toBe('two');
    await expect(prompt('C: ')).resolves.toBe('three');

    rl.close();
  });

  it('resolves a question asked before its answer has arrived yet', async () => {
    const input = new PassThrough();
    const rl = createInterface({ input });
    const prompt = createPrompt(rl);

    const pending = prompt('A: ');
    input.write('late-answer\n');

    await expect(pending).resolves.toBe('late-answer');

    input.end();
    rl.close();
  });

  it('resolves with an empty string when stdin closes before an answer arrives', async () => {
    const input = new PassThrough();
    const rl = createInterface({ input });
    const prompt = createPrompt(rl);

    const pending = prompt('A: ');
    input.end();

    await expect(pending).resolves.toBe('');
    rl.close();
  });
});
