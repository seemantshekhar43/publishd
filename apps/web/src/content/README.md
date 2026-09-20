# posts

Empty in the code repo on purpose. In CI and in production builds, this
directory is populated by `apps/web/scripts/sync-content.mjs`, which fetches
from the private content repo before `astro build` runs (see issue #39 for
that wiring). Never commit real content here - see `AGENTS.md` rule 5 and
`docs/architecture.md` section 2.

For local development and the build-pipeline test in
`apps/web/src/content-collection.build.test.ts`, a fixture post is copied
in temporarily from `apps/web/tests/fixtures/` and removed afterwards.
