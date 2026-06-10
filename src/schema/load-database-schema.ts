import { readFile } from 'node:fs/promises';

import type { DatabaseSchema } from '../types.js';
import { findSchemaFile } from './find-schema-file.js';
import { parsePostgresSchema } from './parse-postgres-schema.js';

export async function loadDatabaseSchema(databaseRepositoryPath: string): Promise<DatabaseSchema> {
    const schemaPath = await findSchemaFile(databaseRepositoryPath);

    if (!schemaPath) {
        throw new Error(`Could not find schema.sql inside ${databaseRepositoryPath}.`);
    }

    const schemaSql = await readFile(schemaPath, 'utf8');

    return {
        sourcePath: schemaPath,
        tables: parsePostgresSchema(schemaSql).filter((table) => table.name !== 'schema_migrations'),
    };
}
