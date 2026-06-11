import { readFile } from 'node:fs/promises';

import type { DatabaseSchema, DatabaseSchemaSourceType } from '../types.js';
import { findSchemaFile } from './find-schema-file.js';
import { parsePrismaSchema } from './parse-prisma-schema.js';
import { parsePostgresSchema } from './parse-postgres-schema.js';

export async function loadDatabaseSchema(
    databaseRepositoryPath: string,
    sourceTypes?: DatabaseSchemaSourceType[],
): Promise<DatabaseSchema> {
    const schemaPath = await findSchemaFile(databaseRepositoryPath, sourceTypes);

    if (!schemaPath) {
        throw new Error(`Could not find supported schema file inside ${databaseRepositoryPath}.`);
    }

    const schemaContent = await readFile(schemaPath, 'utf8');

    if (schemaPath.endsWith('schema.prisma')) {
        return {
            sourcePath: schemaPath,
            sourceType: 'prisma',
            tables: parsePrismaSchema(schemaContent),
        };
    }

    return {
        sourcePath: schemaPath,
        sourceType: 'postgres-sql',
        tables: parsePostgresSchema(schemaContent).filter((table) => table.name !== 'schema_migrations'),
    };
}
