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

export type DatabaseSchemaSourceType = 'postgres-sql' | 'prisma';

export interface DatabaseSchema {
    sourcePath: string;
    sourceType: DatabaseSchemaSourceType;
    tables: DatabaseTable[];
}

export interface DatabaseTable {
    name: string;
    columns: DatabaseColumn[];
    checkConstraints?: DatabaseCheckConstraint[];
    foreignKeys?: DatabaseForeignKeyConstraint[];
    indexes?: DatabaseIndex[];
    uniqueConstraints?: string[][];
}

export interface DatabaseColumn {
    name: string;
    sqlType: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue?: string;
    enumName?: string;
    enumValues?: string[];
    foreignKey?: DatabaseForeignKey;
}

export interface DatabaseCheckConstraint {
    expression: string;
    name?: string;
}

export interface DatabaseForeignKey {
    column: string;
    onDelete?: string;
    table: string;
}

export interface DatabaseForeignKeyConstraint {
    columns: string[];
    name?: string;
    onDelete?: string;
    referencedColumns: string[];
    referencedTable: string;
}

export interface DatabaseIndex {
    expressions: string[];
    method?: string;
    name: string;
    unique: boolean;
    where?: string;
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
    schemaSourceTypes?: DatabaseSchemaSourceType[];
    generate(context: GeneratorContext): GeneratedFile[] | Promise<GeneratedFile[]>;
    afterGenerate?(context: GeneratorContext): void | Promise<void>;
}
