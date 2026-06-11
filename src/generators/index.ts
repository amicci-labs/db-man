import type { ApplicationConfig, GeneratorAdapter } from '../types.js';
import { pythonFastapiSqlalchemyGenerator } from './python-fastapi-sqlalchemy/index.js';
import { typescriptNextjsPrismaGenerator } from './typescript-nextjs-prisma/index.js';

const generatorAdapters: GeneratorAdapter[] = [pythonFastapiSqlalchemyGenerator, typescriptNextjsPrismaGenerator];

export function listGeneratorAdapters(): GeneratorAdapter[] {
    return [...generatorAdapters];
}

export function getGeneratorAdapter(application: ApplicationConfig): GeneratorAdapter {
    const generator = generatorAdapters.find(
        (adapter) =>
            adapter.language === application.language &&
            adapter.framework === application.framework &&
            adapter.repositoryProvider === application.repositoryProvider,
    );

    if (!generator) {
        const supportedAdapters = generatorAdapters.map((adapter) => adapter.id).join(', ');
        throw new Error(
            `No generator found for ${application.language}-${application.framework}-${application.repositoryProvider}. ` +
            `Supported generators: ${supportedAdapters}`,
        );
    }

    return generator;
}
