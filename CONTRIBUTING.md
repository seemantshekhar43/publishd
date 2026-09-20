# Contributing

This is a single-author project that happens to be open source. You are welcome to run your own deployment, and issues and PRs are welcome within the scope below.

## Scope

**Likely to be accepted**

- Bug fixes with a reproducing test
- Documentation fixes, especially anything inaccurate
- Accessibility and performance improvements
- Making something configurable that is currently hardcoded

**Likely to be declined**

- New content kinds beyond `article` and `page`
- A database, admin UI, or web editor - see `docs/PRD.md` §3
- Multi-author or permissions support
- An HTML sanitiser - see `docs/architecture.md` §6
- Design changes to the default theme (add a preset instead)

If you are unsure, open an issue before writing code.

## Before opening a PR

Read [`docs/development.md`](docs/development.md). The workflow is issue -> branch -> PR -> gate -> merge, and PRs without an issue will be asked for one.

- Conventional commits
- Tests for new logic
- Docs updated in the same PR if behaviour changed
- No secrets, ever - this repository is public and has push protection enabled

## Running your own deployment

You do not need to contribute to use this. See the README for the deploy path. If something requires editing source to make it yours, that is a bug worth reporting.
