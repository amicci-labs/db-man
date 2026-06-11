import { intro, log, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';

import { readDbmanConfig } from '../config/read-dbman-config.js';
import { getGeneratorAdapter } from '../generators/index.js';
import { cloneOrFetchDatabaseRepository } from '../git/clone-or-fetch-database-repository.js';
import { loadDatabaseSchema } from '../schema/load-database-schema.js';
import { applyFilePlan, buildFilePlan, printFilePlan } from '../utils/file-writer.js';

interface GenerateOptions {
    dryRun: boolean;
    help: boolean;
}

export async function generateCommand(args: string[], appRoot = process.cwd()): Promise<void> {
    const options = parseGenerateOptions(args);

    if (options.help) {
        printHelp();
        return;
    }

    intro(pc.bgCyan(pc.black(options.dryRun ? ' db-man generate --dry-run ' : ' db-man generate ')));

    const loader = spinner();

    loader.start('Loading .dbman');
    const config = await readDbmanConfig(appRoot);
    loader.stop('Loaded .dbman');

    const generator = getGeneratorAdapter(config.application);
    log.success(`Selected generator ${pc.cyan(generator.id)}`);

    loader.start('Resolving database repository');
    const databaseRepository = await cloneOrFetchDatabaseRepository(config.databaseRepository, appRoot);
    loader.stop(databaseRepository.message);

    loader.start('Loading database schema');
    const schema = await loadDatabaseSchema(databaseRepository.path, generator.schemaSourceTypes);
    loader.stop(`Loaded schema ${pc.dim(schema.sourcePath)}`);

    const generatorContext = { appRoot, config, schema };

    loader.start('Building generation plan');
    const generatedFiles = await generator.generate(generatorContext);
    const plan = await buildFilePlan(appRoot, generatedFiles);
    loader.stop(`Planned ${plan.length} file(s)`);

    printFilePlan(appRoot, plan, options.dryRun);

    if (options.dryRun) {
        outro('No files were changed. Run `db-man generate` to apply this plan.');
        return;
    }

    loader.start('Writing files');
    await applyFilePlan(plan);
    const changedCount = plan.filter((entry) => entry.action !== 'unchanged').length;
    loader.stop(`Wrote ${changedCount} file(s)`);

    if (generator.afterGenerate) {
        loader.start('Running post-generation steps');
        await generator.afterGenerate(generatorContext);
        loader.stop('Post-generation steps completed');
    }

    outro('Generation completed.');
}


function parseGenerateOptions(args: string[]): GenerateOptions {
    const options: GenerateOptions = {
        dryRun: false,
        help: false,
    };

    for (const argument of args) {
        if (argument === '--dry-run') {
            options.dryRun = true;
            continue;
        }

        if (argument === '-h' || argument === '--help') {
            options.help = true;
            continue;
        }

        throw new Error(`Unknown option for generate: ${argument}`);
    }

    return options;
}

function printHelp(): void {
    console.log(`db-man generate

Generates application files from the database repository configured in .dbman.

Options:
  --dry-run   Show the file plan without changing files.
`);
}
