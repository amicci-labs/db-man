import type { GeneratedFile, GeneratorAdapter } from '../../types.js';
import { generateModels } from './generate-models.js';
import { generateRepositories } from './generate-repositories.js';
import { generateTypes } from './generate-types.js';

export const pythonFastapiSqlalchemyGenerator: GeneratorAdapter = {
    framework: 'fastapi',
    generate(context): GeneratedFile[] {
        return [
            {
                content: generateModels(context.schema.tables),
                path: 'app/database/models.py',
            },
            {
                content: generateTypes(context.schema.tables),
                path: 'app/database/schemas.py',
            },
            ...generateRepositories(context.schema.tables),
        ];
    },
    id: 'python-fastapi-sqlalchemy',
    language: 'python',
    repositoryProvider: 'sqlalchemy',
};
