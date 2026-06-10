import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DbmanConfig } from '../types.js';

export async function readDbmanConfig(appRoot = process.cwd()): Promise<DbmanConfig> {
    const configPath = path.join(appRoot, '.dbman');
    const rawConfig = await readFile(configPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            throw new Error('Could not find .dbman in the current directory. Run `db-man init` first.');
        }

        throw error;
    });

    const parsedConfig = JSON.parse(rawConfig) as unknown;
    assertDbmanConfig(parsedConfig);
    return parsedConfig;
}

function assertDbmanConfig(value: unknown): asserts value is DbmanConfig {
    if (!isRecord(value)) {
        throw new Error('.dbman must be a JSON object.');
    }

    if (!isRecord(value.databaseRepository)) {
        throw new Error('.dbman must include databaseRepository.');
    }

    if (!isRecord(value.application)) {
        throw new Error('.dbman must include application.');
    }

    assertString(value.databaseRepository.name, 'databaseRepository.name');
    assertString(value.databaseRepository.gitUrl, 'databaseRepository.gitUrl');
    assertString(value.application.language, 'application.language');
    assertString(value.application.framework, 'application.framework');
    assertString(value.application.repositoryProvider, 'application.repositoryProvider');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, fieldName: string): asserts value is string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`.dbman field ${fieldName} must be a non-empty string.`);
    }
}
