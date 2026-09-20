import conventional from '@commitlint/config-conventional';

/** Scopes used by hand, matching the `area:` labels in docs/development.md section 5. */
const AREA_SCOPES = [
  'cli',
  'web',
  'ingest',
  'schema',
  'skill',
  'content',
  'infra',
  'deps',
  'ci',
  'docs',
  'prd',
  'architecture',
  'design',
  'development',
  'roadmap',
];

/**
 * The no-mistakes gate commits its own fixes as `no-mistakes(<step>): ...`.
 * Those commits run through this config like any other, so the type and the
 * pipeline step names have to be allowed or the gate cannot commit a fix.
 */
const GATE_STEPS = [
  'intent',
  'rebase',
  'review',
  'test',
  'document',
  'lint',
  'push',
  'pr',
  'ci',
];

export default {
  extends: ['@commitlint/config-conventional'],
  // The default conventional header pattern matches the type as `\w*`, which
  // excludes the hyphen in `no-mistakes`. Widen it so the gate's own commits
  // parse; everything else about the format is unchanged.
  parserPreset: {
    parserOpts: {
      headerPattern: /^([\w-]+)(?:\(([\w$.\-*/\s]*)\))?!?: (.*)$/,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    'type-enum': [2, 'always', [...conventional.rules['type-enum'][2], 'no-mistakes']],
    'scope-enum': [2, 'always', [...AREA_SCOPES, ...GATE_STEPS]],
    'body-max-line-length': [0],
  },
};
