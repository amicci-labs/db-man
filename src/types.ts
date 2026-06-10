export type FileAction = 'create' | 'update' | 'unchanged';

export interface DbmanConfig {
    databaseRepository: DatabaseRepositoryReference;
    application: ApplicationConfig;
}

export interface DatabaseRepositoryReference {
    name: string;
    gitUrl: string;
}

export interface DatabaseRepositoryOption extends DatabaseRepositoryReference {
    source: 'github' | 'local';
    localPath?: string;
}

export interface DatabaseRepositoryResolution {
    path: string;
    source: 'local-sibling' | 'local-path' | 'cache' | 'clone';
    message: string;
}

export interface ApplicationConfig {
    language: string;
    framework: string;
    repositoryProvider: string;
}

export interface DatabaseSchema {
    sourcePath: string;
    tables: DatabaseTable[];
}

export interface DatabaseTable {
    name: string;
    columns: DatabaseColumn[];
}

export interface DatabaseColumn {
    name: string;
    sqlType: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue?: string;
}

export interface GeneratedFile {
    path: string;
    content: string;
}

export interface FilePlanEntry extends GeneratedFile {
    absolutePath: string;
    action: FileAction;
}

export interface GeneratorContext {
    appRoot: string;
    config: DbmanConfig;
    schema: DatabaseSchema;
}

export interface GeneratorAdapter {
    id: string;
    language: string;
    framework: string;
    repositoryProvider: string;
    generate(context: GeneratorContext): GeneratedFile[] | Promise<GeneratedFile[]>;
}
