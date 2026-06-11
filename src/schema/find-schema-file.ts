import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseSchemaSourceType } from '../types.js';

const schemaSources: Array<{ sourceType: DatabaseSchemaSourceType; preferredPath: string; fileName: string }> = [
    { fileName: 'schema.sql', preferredPath: 'src/db/schema.sql', sourceType: 'postgres-sql' },
    { fileName: 'schema.prisma', preferredPath: 'prisma/schema.prisma', sourceType: 'prisma' },
];
const ignoredDirectories = new Set([
    '.git',
    '.hg',
    '.svn',
    'coverage',
    'dist',
    'node_modules',
]);

export async function findSchemaFile(
    repositoryPath: string,
    sourceTypes: DatabaseSchemaSourceType[] = ['postgres-sql', 'prisma'],
): Promise<string | undefined> {
    const supportedSources = schemaSources.filter((source) => sourceTypes.includes(source.sourceType));
    const supportedFileNames = new Set(supportedSources.map((source) => source.fileName));

    for (const schemaSource of supportedSources) {
        const preferredPath = path.join(repositoryPath, schemaSource.preferredPath);

        if (await isFile(preferredPath)) {
            return preferredPath;
        }
    }

    return findFirstSchemaFile(repositoryPath, supportedFileNames);
}

async function findFirstSchemaFile(directoryPath: string, supportedFileNames: Set<string>): Promise<string | undefined> {
    const entries = await readdir(directoryPath, { withFileTypes: true }).catch(() => []);
    const sortedEntries = [...entries].sort((firstEntry, secondEntry) => {
        if (firstEntry.isDirectory() && !secondEntry.isDirectory()) {
            return 1;
        }

        if (!firstEntry.isDirectory() && secondEntry.isDirectory()) {
            return -1;
        }

        return firstEntry.name.localeCompare(secondEntry.name);
    });

    for (const entry of sortedEntries) {
        const entryPath = path.join(directoryPath, entry.name);

        if (entry.isFile() && supportedFileNames.has(entry.name)) {
            return entryPath;
        }

        if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) {
            continue;
        }

        const schemaPath = await findFirstSchemaFile(entryPath, supportedFileNames);
        if (schemaPath) {
            return schemaPath;
        }
    }

    return undefined;
}

async function isFile(filePath: string): Promise<boolean> {
    return stat(filePath).then((fileStat) => fileStat.isFile(), () => false);
}