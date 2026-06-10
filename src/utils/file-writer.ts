import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import pc from 'picocolors';

import type { FilePlanEntry, GeneratedFile } from '../types.js';

export async function buildFilePlan(appRoot: string, generatedFiles: GeneratedFile[]): Promise<FilePlanEntry[]> {
    const plan: FilePlanEntry[] = [];

    for (const generatedFile of generatedFiles) {
        const absolutePath = path.join(appRoot, generatedFile.path);
        const currentContent = await readFile(absolutePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
                return undefined;
            }

            throw error;
        });
        const action = currentContent === undefined ? 'create' : currentContent === generatedFile.content ? 'unchanged' : 'update';

        plan.push({
            ...generatedFile,
            absolutePath,
            action,
        });
    }

    return plan;
}

export function printFilePlan(appRoot: string, plan: FilePlanEntry[], dryRun: boolean): void {
    console.log(pc.bold(dryRun ? 'Dry-run plan:' : 'Generation plan:'));

    for (const entry of plan) {
        const relativePath = path.relative(appRoot, entry.absolutePath);
        console.log(`  ${formatAction(entry.action)} ${pc.dim(relativePath)}`);
    }
}

function formatAction(action: FilePlanEntry['action']): string {
    if (action === 'create') {
        return pc.green(action.toUpperCase().padEnd(9));
    }

    if (action === 'update') {
        return pc.yellow(action.toUpperCase().padEnd(9));
    }

    return pc.dim(action.toUpperCase().padEnd(9));
}

export async function applyFilePlan(plan: FilePlanEntry[]): Promise<void> {
    for (const entry of plan) {
        if (entry.action === 'unchanged') {
            continue;
        }

        await mkdir(path.dirname(entry.absolutePath), { recursive: true });
        await writeFile(entry.absolutePath, entry.content, 'utf8');
    }
}
