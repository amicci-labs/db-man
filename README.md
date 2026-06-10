# db-man

`db-man` generates application persistence code from database schema repositories.

The first adapter supports Python/FastAPI applications that use SQLAlchemy and Pydantic. The database repository remains the owner of migrations and `schema.sql`; `db-man` consumes that contract and writes compatible files inside each application repository.

## Requirements

- Node.js and npm to install and run the CLI.
- Git to clone, fetch, or update database repositories.
- GitHub CLI (`gh`) is optional. When available and authenticated, `db-man init` uses it to list GitHub repositories ending in `-database`. Without `gh`, the CLI still works by finding local sibling repositories or by letting you enter the repository name and Git URL manually.

## Install

From the npm registry:

```bash
npm install -g @amicci-labs/db-man
```

From GitHub, without publishing to npm:

```bash
npm install -g github:amicci-labs/db-man
```

For private repositories, use SSH access:

```bash
npm install -g git+ssh://git@github.com/amicci-labs/db-man.git
```

For GitHub Packages, configure npm first:

```text
@amicci-labs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then install with the same package name:

```bash
npm install -g @amicci-labs/db-man
```

For local development in this workspace:

```bash
cd db-man
npm install
npm run build
npm install -g .
```

Check the binary:

```bash
db-man --help
```

## Initialize An App

Run this from the application repository root, for example `fintech-api`:

```bash
db-man init
```

The command creates a `.dbman` file like this:

```json
{
  "databaseRepository": {
    "name": "fintech-database",
    "gitUrl": "git@github.com:amicci-labs/fintech-database.git"
  },
  "application": {
    "language": "python",
    "framework": "fastapi",
    "repositoryProvider": "sqlalchemy"
  }
}
```

After creation, the CLI suggests:

```bash
db-man generate --dry-run
db-man generate
```

## Generate

Preview generated files without changing the app:

```bash
db-man generate --dry-run
```

Apply changes:

```bash
db-man generate
```

The current adapter writes:

- `app/database/models.py`
- `app/database/schemas.py`
- `app/repositories/<table>_repository.py`

## Schema Resolution

When `db-man generate` runs, it reads `.dbman`, resolves the configured database repository, finds `schema.sql`, selects the configured adapter, and builds a file plan. `db-man` prefers `src/db/schema.sql` when it exists, then searches the repository for the first `schema.sql` while skipping directories such as `.git`, `node_modules`, and `dist`.

Repository resolution order:

1. Use a local sibling repository with the configured name, for example `../fintech-database`, when it exists.
2. Use a local path when `databaseRepository.gitUrl` is a local path.
3. Use the cached clone in `~/.db-man/repositories/<name>` and update it.
4. Clone from `databaseRepository.gitUrl` into the cache.

The CLI prints which source it used, for example:

```text
Using local sibling repository ../fintech-database
```

This matters during local development: generated files may reflect local database schema changes that have not been pushed to GitHub yet.

## Release

Before publishing or tagging a release, validate the package:

```bash
npm ci
npm run build
npm pack --dry-run
```

Publish to the npm registry:

```bash
npm publish --access public
```

Install after publishing:

```bash
npm install -g @amicci-labs/db-man
```

## Adapter Model

Generators are registered by application language, framework, and repository provider. New adapters can be added under `src/generators`, for example:

- `node-nestjs-prisma`
- `node-nestjs-drizzle`
- `python-fastapi-sqlmodel`
- `python-fastapi-sqlalchemy`
