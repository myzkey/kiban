# Release

Kiban uses Changesets to automate npm releases from `main`.

## One-time Setup

Add an npm automation token to the GitHub repository secrets:

```text
NPM_TOKEN
```

The release workflow runs with npm provenance enabled.

## During Development

When a change should be released, create a changeset:

```sh
pnpm changeset
```

Commit the generated `.changeset/*.md` file with the code change.

## Release Flow

1. A change with a changeset is merged to `main`
2. GitHub Actions opens a Version Packages release PR
3. Merging that release PR updates versions and changelog
4. GitHub Actions publishes the package to npm

## Local Commands

```sh
pnpm changeset
pnpm changeset:version
pnpm release
```

`pnpm release` is intended for CI. It builds the package and runs `changeset publish`.
