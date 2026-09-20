# Security

This repository is public from the first commit. See `docs/development.md`
section 8 and `docs/PRD.md` section 10.6 for the full reasoning.

## Reporting a suspected leak

If you find a secret (a token, API key, or credential) committed to this
repository - anywhere in history, not just the current tip:

1. **Rotate the secret first.** Do not wait for a response before doing this.
   A token pushed to a public repo is burned the moment it lands, and
   rewriting history does not un-burn it.
2. Open a [private security advisory](../../security/advisories/new) on this
   repository, or email the maintainer directly if you cannot reach GitHub's
   advisory form. Do not open a public issue - that documents the leak
   further.
3. Include the commit, file, and line if you know them, so the history can be
   scrubbed after rotation.

## Reporting other vulnerabilities

For anything else (a logic flaw, an auth bypass, an injection vector),
use the same private advisory flow above rather than a public issue.

## What is already in place

- GitHub secret scanning and push protection are enabled on this repository.
- `gitleaks` runs in pre-commit (staged changes) and in CI (full history diff
  on every pull request).
- There is no bypass path for either. If push protection blocks a legitimate
  change, the fix is to rotate the secret, not to disable the check.
