# db-man

`db-man` generates application persistence code from database schema repositories.

The first adapter supports Python/FastAPI applications that use SQLAlchemy and Pydantic.

## Install

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

## Adapter Model

Generators are registered by application language, framework, and repository provider. New adapters can be added under `src/generators`, for example:

- `node-nestjs-prisma`
- `node-nestjs-drizzle`
- `python-fastapi-sqlmodel`
- `python-fastapi-sqlalchemy`
