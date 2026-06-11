import { stat } from 'node:fs/promises';
import path from 'node:path';

import { cancel, confirm, intro, isCancel, log, note, outro, select, spinner, text } from '@clack/prompts';
import pc from 'picocolors';

import { writeDbmanConfig } from '../config/write-dbman-config.js';
import { listDatabaseRepositories } from '../git/list-database-repositories.js';
import type { ApplicationConfig, DatabaseRepositoryOption, DatabaseRepositoryReference, DbmanConfig } from '../types.js';

interface ApplicationOption {
    label: string;
    application: Omit<ApplicationConfig, 'repositoryProvider'>;
    repositoryProviders: string[];
}

const applicationOptions: ApplicationOption[] = [
    {
        application: {
            framework: 'fastapi',
            language: 'python',
        },
        label: 'python-fastapi',
        repositoryProviders: ['sqlalchemy'],
    },
    {
        application: {
            framework: 'nextjs',
            language: 'typescript',
        },
        label: 'typescript-nextjs',
        repositoryProviders: ['prisma'],
    },
];

export async function initCommand(args: string[], appRoot = process.cwd()): Promise<void> {
    if (args.includes('-h') || args.includes('--help')) {
        printHelp();
        return;
    }

    intro(pc.bgCyan(pc.black(' db-man init ')));

    const configPath = path.join(appRoot, '.dbman');
    const configAlreadyExists = await exists(configPath);

    if (configAlreadyExists) {
        const shouldOverwrite = await promptConfirm('.dbman already exists. Overwrite it?', false);
        if (!shouldOverwrite) {
            cancel('Init cancelled.');
            return;
        }
    }

    const loader = spinner();
    loader.start('Looking for database repositories');
    const repositories = await listDatabaseRepositories(appRoot);
    loader.stop(`Found ${repositories.length} database repository option(s)`);

    const selectedRepository = await selectDatabaseRepository(repositories);
    const selectedApplication = await promptSelect(
        'Qual é a linguagem/framework da aplicação atual?',
        applicationOptions.map((option) => ({
            hint: option.repositoryProviders.join(', '),
            label: option.label,
            value: option,
        })),
    );
    const repositoryProvider = await promptSelect(
        'Qual tecnologia de persistência/repositories a aplicação usa?',
        selectedApplication.repositoryProviders.map((provider) => ({
            label: provider,
            value: provider,
        })),
    );
    const config: DbmanConfig = {
        databaseRepository: selectedRepository,
        application: {
            ...selectedApplication.application,
            repositoryProvider,
        },
    };

    note(JSON.stringify(config, null, 2), '.dbman to be created');

    const confirmed = await promptConfirm('Create this configuration?', true);
    if (!confirmed) {
        cancel('Init cancelled.');
        return;
    }

    await writeDbmanConfig(config, appRoot);
    log.success(`Created ${pc.cyan('.dbman')}`);
    outro(`Next steps:\n${pc.cyan('db-man generate --dry-run')}\n${pc.cyan('db-man generate')}`);
}

function printHelp(): void {
    console.log(`db-man init

Creates a .dbman file in the current application root.
`);
}

async function selectDatabaseRepository(repositories: DatabaseRepositoryOption[]): Promise<DatabaseRepositoryReference> {
    if (!repositories.length) {
        log.warn('No repositories ending in -database were found via GitHub CLI or local sibling folders.');
        return promptManualDatabaseRepository();
    }

    const manualOption = '__manual__';
    const selectedRepository = await promptSelect<DatabaseRepositoryOption | typeof manualOption>(
        'Qual repositório de banco de dados será utilizado por essa aplicação?',
        [
            ...repositories.map((repository) => ({
                hint: repository.gitUrl,
                label: `${repository.name} (${repository.source})`,
                value: repository,
            })),
            {
                label: 'Informar outro repositório manualmente',
                value: manualOption,
            },
        ],
    );

    if (selectedRepository === manualOption) {
        return promptManualDatabaseRepository();
    }

    return {
        gitUrl: selectedRepository.gitUrl,
        name: selectedRepository.name,
    };
}

async function promptManualDatabaseRepository(): Promise<DatabaseRepositoryReference> {
    const name = await promptText('Repository name');
    const gitUrl = await promptText('Repository Git URL');

    return { gitUrl, name };
}

async function promptSelect<T>(message: string, options: Array<{ label: string; value: T; hint?: string }>): Promise<T> {
    const value = await select<T>({ message, options: options as Parameters<typeof select<T>>[0]['options'] });
    return unwrapPrompt(value);
}

async function promptText(message: string): Promise<string> {
    const value = await text({ message, validate: (inputValue) => (inputValue?.trim() ? undefined : 'This field is required.') });
    return unwrapPrompt(value).trim();
}

async function promptConfirm(message: string, initialValue: boolean): Promise<boolean> {
    const value = await confirm({ initialValue, message });
    return unwrapPrompt(value);
}

function unwrapPrompt<T>(value: T | symbol): T {
    if (isCancel(value)) {
        cancel('Init cancelled.');
        process.exit(0);
    }

    return value;
}

async function exists(filePath: string): Promise<boolean> {
    return stat(filePath).then(() => true, () => false);
}
