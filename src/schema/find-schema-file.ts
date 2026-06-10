import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const preferredSchemaPath = 'src/db/schema.sql';
const ignoredDirectories = new Set([
    '.git',
    '.hg',
    '.svn',
    'coverage',
    'dist',
    'node_modules',
]);

export async function findSchemaFile(repositoryPath: string): Promise<string | undefined> {
    const preferredPath = path.join(repositoryPath, preferredSchemaPath);

    if (await isFile(preferredPath)) {
        return preferredPath;
    }

    return findFirstSchemaFile(repositoryPath);
}

async function findFirstSchemaFile(directoryPath: string): Promise<string | undefined> {
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

        if (entry.isFile() && entry.name === 'schema.sql') {
            return entryPath;
        }

        if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) {
            continue;
        }

        const schemaPath = await findFirstSchemaFile(entryPath);
        if (schemaPath) {
            return schemaPath;
        }
    }

    return undefined;
}

async function isFile(filePath: string): Promise<boolean> {
    return stat(filePath).then((fileStat) => fileStat.isFile(), () => false);
}