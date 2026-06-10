import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type { DatabaseRepositoryOption } from '../types.js';
import { runCommand, runGit } from '../utils/command.js';
import { parseGitRemoteUrl, toSshGitUrl } from './git-url.js';

interface GhRepository {
    name: string;
    sshUrl?: string;
    url?: string;
}

export async function listDatabaseRepositories(appRoot = process.cwd()): Promise<DatabaseRepositoryOption[]> {
    const [githubRepositories, localRepositories] = await Promise.all([
        listGithubDatabaseRepositories(appRoot),
        listLocalDatabaseRepositories(appRoot),
    ]);

    const repositoriesByName = new Map<string, DatabaseRepositoryOption>();

    for (const repository of [...githubRepositories, ...localRepositories]) {
        if (!repositoriesByName.has(repository.name)) {
            repositoriesByName.set(repository.name, repository);
        }
    }

    return [...repositoriesByName.values()].sort((first, second) => first.name.localeCompare(second.name));
}

async function listGithubDatabaseRepositories(appRoot: string): Promise<DatabaseRepositoryOption[]> {
    const originUrl = await getOriginUrl(appRoot);
    if (!originUrl) {
        return [];
    }

    const parsedOrigin = parseGitRemoteUrl(originUrl);
    if (!parsedOrigin.owner) {
        return [];
    }

    const ghResult = await runCommand(
        'gh',
        ['repo', 'list', parsedOrigin.owner, '--json', 'name,sshUrl,url', '--limit', '1000'],
        appRoot,
    ).catch(() => undefined);

    if (!ghResult) {
        return [];
    }

    const repositories = JSON.parse(ghResult.stdout) as GhRepository[];

    return repositories
        .filter((repository) => repository.name.endsWith('-database'))
        .map((repository) => ({
            gitUrl: repository.sshUrl ?? repository.url ?? toSshGitUrl(parsedOrigin.owner!, repository.name, parsedOrigin.host),
            name: repository.name,
            source: 'github',
        }));
}

async function listLocalDatabaseRepositories(appRoot: string): Promise<DatabaseRepositoryOption[]> {
    const parentDirectory = path.dirname(appRoot);
    const entries = await readdir(parentDirectory, { withFileTypes: true }).catch(() => []);
    const repositories: DatabaseRepositoryOption[] = [];

    for (const entry of entries) {
        const localPath = path.join(parentDirectory, entry.name);
        const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && (await isDirectoryPath(localPath)));

        if (!isDirectory || !entry.name.endsWith('-database')) {
            continue;
        }

        const hasGitDirectory = await stat(path.join(localPath, '.git')).then(() => true, () => false);
        const hasSchema = await stat(path.join(localPath, 'src/db/schema.sql')).then(() => true, () => false);

        if (!hasGitDirectory && !hasSchema) {
            continue;
        }

        repositories.push({
            gitUrl: (await getOriginUrl(localPath)) ?? localPath,
            localPath,
            name: entry.name,
            source: 'local',
        });
    }

    return repositories;
}

async function getOriginUrl(repositoryPath: string): Promise<string | undefined> {
    const result = await runGit(['remote', 'get-url', 'origin'], repositoryPath).catch(() => undefined);
    return result?.stdout.trim() || undefined;
}

async function isDirectoryPath(filePath: string): Promise<boolean> {
    return stat(filePath).then((fileStat) => fileStat.isDirectory(), () => false);
}
