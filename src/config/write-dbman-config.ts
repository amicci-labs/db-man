import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DbmanConfig } from '../types.js';

export async function writeDbmanConfig(config: DbmanConfig, appRoot = process.cwd()): Promise<string> {
    const configPath = path.join(appRoot, '.dbman');
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    return configPath;
}
