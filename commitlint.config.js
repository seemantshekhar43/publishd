export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Scopes match the areas used for issue labels; see docs/development.md section 2.
    'scope-enum': [
      2,
      'always',
      [
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
      ],
    ],
    'body-max-line-length': [0],
  },
};
