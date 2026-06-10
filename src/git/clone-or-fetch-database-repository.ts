import { mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { DatabaseRepositoryReference, DatabaseRepositoryResolution } from '../types.js';
import { runGit } from '../utils/command.js';

export async function cloneOrFetchDatabaseRepository(
    repository: DatabaseRepositoryReference,
    appRoot = process.cwd(),
): Promise<DatabaseRepositoryResolution> {
    const localSiblingPath = await findLocalSiblingRepository(repository.name, appRoot);
    if (localSiblingPath) {
        return {
            message: `Using local sibling repository ${path.relative(appRoot, localSiblingPath)}`,
            path: localSiblingPath,
            source: 'local-sibling',
        };
    }

    if (isLocalPath(repository.gitUrl)) {
        const localPath = path.resolve(appRoot, repository.gitUrl);
        return {
            message: `Using local repository ${path.relative(appRoot, localPath)}`,
            path: localPath,
            source: 'local-path',
        };
    }

    const cacheRoot = process.env.DB_MAN_CACHE_DIR ?? path.join(os.homedir(), '.db-man', 'repositories');
    const repositoryPath = path.join(cacheRoot, sanitizePathSegment(repository.name));

    if (await exists(path.join(repositoryPath, '.git'))) {
        await runGit(['fetch', '--prune'], repositoryPath);
        await runGit(['pull', '--ff-only'], repositoryPath);
        return {
            message: `Using cached repository ${repositoryPath}`,
            path: repositoryPath,
            source: 'cache',
        };
    }

    await mkdir(cacheRoot, { recursive: true });
    await runGit(['clone', repository.gitUrl, repositoryPath], cacheRoot);
    return {
        message: `Cloned repository to ${repositoryPath}`,
        path: repositoryPath,
        source: 'clone',
    };
}

async function findLocalSiblingRepository(repositoryName: string, appRoot: string): Promise<string | undefined> {
    const siblingPath = path.join(path.dirname(appRoot), repositoryName);
    const schemaPath = path.join(siblingPath, 'src/db/schema.sql');

    if (await exists(schemaPath)) {
        return siblingPath;
    }

    return undefined;
}

function isLocalPath(value: string): boolean {
    return value.startsWith('.') || value.startsWith('/') || value.startsWith('~');
}

function sanitizePathSegment(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

async function exists(filePath: string): Promise<boolean> {
    return stat(filePath).then(() => true, () => false);
}
