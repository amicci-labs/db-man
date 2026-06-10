import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseSchema } from '../types.js';
import { parsePostgresSchema } from './parse-postgres-schema.js';

export async function loadDatabaseSchema(databaseRepositoryPath: string): Promise<DatabaseSchema> {
    const schemaPath = path.join(databaseRepositoryPath, 'src/db/schema.sql');
    const schemaSql = await readFile(schemaPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            throw new Error(`Could not find database schema at ${schemaPath}.`);
        }

        throw error;
    });

    return {
        sourcePath: schemaPath,
        tables: parsePostgresSchema(schemaSql).filter((table) => table.name !== 'schema_migrations'),
    };
}
