import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { GeneratedFile, GeneratorAdapter } from '../../types.js';
import { runCommand } from '../../utils/command.js';

export const typescriptNextjsPrismaGenerator: GeneratorAdapter = {
    async afterGenerate(context): Promise<void> {
        const prismaCommand = await resolveLocalPrismaCommand(context.appRoot);

        try {
            await runCommand(prismaCommand, ['generate'], context.appRoot, { timeout: 120_000 });
        } catch (error) {
            throw new Error(`Failed to run local Prisma generate. ${formatCommandError(error)}`);
        }
    },
    framework: 'nextjs',
    async generate(context): Promise<GeneratedFile[]> {
        if (context.schema.sourceType !== 'prisma') {
            throw new Error(
                'typescript-nextjs-prisma requires schema.prisma in the configured database repository. ' +
                'SQL schemas are still supported by adapters that can translate schema.sql directly.',
            );
        }

        const schemaPrisma = await readFile(context.schema.sourcePath, 'utf8');

        return [
            {
                content: ensureTrailingNewline(schemaPrisma),
                path: 'prisma/schema.prisma',
            },
        ];
    },
    id: 'typescript-nextjs-prisma',
    language: 'typescript',
    repositoryProvider: 'prisma',
    schemaSourceTypes: ['prisma'],
};

function ensureTrailingNewline(value: string): string {
    return value.endsWith('\n') ? value : `${value}\n`;
}

async function resolveLocalPrismaCommand(appRoot: string): Promise<string> {
    const commandName = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
    const prismaCommand = path.join(appRoot, 'node_modules', '.bin', commandName);

    if (await isFile(prismaCommand)) {
        return prismaCommand;
    }

    throw new Error(
        `Could not find local Prisma CLI at ${path.relative(appRoot, prismaCommand)}. ` +
        'Install the application dependencies first, then run db-man generate again.',
    );
}

async function isFile(filePath: string): Promise<boolean> {
    return stat(filePath).then((fileStat) => fileStat.isFile(), () => false);
}

function formatCommandError(error: unknown): string {
    if (!isCommandError(error)) {
        return error instanceof Error ? error.message : String(error);
    }

    const output = [error.stdout, error.stderr]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n')
        .trim();

    return output || error.message;
}

function isCommandError(error: unknown): error is Error & { stdout?: string; stderr?: string } {
    return error instanceof Error;
}