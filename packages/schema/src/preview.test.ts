import { describe, expect, it } from 'vitest';
import { derivePreviewId } from './preview.js';

describe('derivePreviewId', () => {
  it('is stable for the same slug and secret', () => {
    const a = derivePreviewId('k8s-beelink-cluster', 'secret-one');
    const b = derivePreviewId('k8s-beelink-cluster', 'secret-one');
    expect(a).toBe(b);
  });

  it('differs across slugs', () => {
    const a = derivePreviewId('k8s-beelink-cluster', 'secret-one');
    const b = derivePreviewId('nixos-rebuild', 'secret-one');
    expect(a).not.toBe(b);
  });

  it('differs across secrets, so the slug alone is not enough to guess it', () => {
    const a = derivePreviewId('k8s-beelink-cluster', 'secret-one');
    const b = derivePreviewId('k8s-beelink-cluster', 'secret-two');
    expect(a).not.toBe(b);
  });

  it('has the shape of a UUID', () => {
    const id = derivePreviewId('k8s-beelink-cluster', 'secret-one');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
