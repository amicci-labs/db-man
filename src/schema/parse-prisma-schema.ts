import type { DatabaseColumn, DatabaseTable } from '../types.js';

export function parsePrismaSchema(schemaPrisma: string): DatabaseTable[] {
    const enumNames = collectBlockNames(schemaPrisma, 'enum');
    const modelNames = collectBlockNames(schemaPrisma, 'model');
    const tables: DatabaseTable[] = [];

    for (const block of readBlocks(schemaPrisma, 'model')) {
        tables.push({
            columns: parseModelColumns(block.body, enumNames, modelNames),
            name: block.name,
        });
    }

    return tables;
}

function collectBlockNames(schemaPrisma: string, blockType: 'enum' | 'model'): Set<string> {
    return new Set(readBlocks(schemaPrisma, blockType).map((block) => block.name));
}

function readBlocks(schemaPrisma: string, blockType: 'enum' | 'model'): Array<{ name: string; body: string }> {
    const blocks: Array<{ name: string; body: string }> = [];
    const blockPattern = new RegExp(`^\\s*${blockType}\\s+(\\w+)\\s*\\{`, 'gm');

    for (const match of schemaPrisma.matchAll(blockPattern)) {
        const name = match[1];
        const bodyStart = match.index + match[0].length;
        const bodyEnd = findMatchingBrace(schemaPrisma, bodyStart - 1);

        if (bodyEnd === -1) {
            continue;
        }

        blocks.push({
            body: schemaPrisma.slice(bodyStart, bodyEnd),
            name,
        });
    }

    return blocks;
}

function findMatchingBrace(value: string, openingBraceIndex: number): number {
    let depth = 0;

    for (let index = openingBraceIndex; index < value.length; index += 1) {
        if (value[index] === '{') {
            depth += 1;
            continue;
        }

        if (value[index] !== '}') {
            continue;
        }

        depth -= 1;
        if (depth === 0) {
            return index;
        }
    }

    return -1;
}

function parseModelColumns(body: string, enumNames: Set<string>, modelNames: Set<string>): DatabaseColumn[] {
    const columns: DatabaseColumn[] = [];

    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();

        if (!line || line.startsWith('//') || line.startsWith('@@')) {
            continue;
        }

        const parts = line.split(/\s+/);
        if (parts.length < 2) {
            continue;
        }

        const [name, rawType] = parts;
        const normalizedType = normalizePrismaType(rawType);
        const baseType = normalizedType.replace(/\[\]$/, '');

        if (modelNames.has(baseType)) {
            continue;
        }

        columns.push({
            defaultValue: extractPrismaDefault(line),
            name,
            nullable: rawType.endsWith('?'),
            primaryKey: /(?:^|\s)@id(?:\s|$)/.test(line),
            sqlType: mapPrismaTypeToSqlType(normalizedType, enumNames),
        });
    }

    return columns;
}

function normalizePrismaType(rawType: string): string {
    return rawType.replace(/\?$/, '');
}

function mapPrismaTypeToSqlType(prismaType: string, enumNames: Set<string>): string {
    const isArray = prismaType.endsWith('[]');
    const baseType = prismaType.replace(/\[\]$/, '');
    const sqlType = mapPrismaScalarToSqlType(baseType, enumNames);

    return isArray ? `${sqlType}[]` : sqlType;
}

function mapPrismaScalarToSqlType(prismaType: string, enumNames: Set<string>): string {
    if (enumNames.has(prismaType)) {
        return prismaType;
    }

    switch (prismaType) {
        case 'BigInt':
            return 'bigint';
        case 'Boolean':
            return 'boolean';
        case 'Bytes':
            return 'bytea';
        case 'DateTime':
            return 'timestamp with time zone';
        case 'Decimal':
            return 'decimal';
        case 'Float':
            return 'double precision';
        case 'Int':
            return 'integer';
        case 'Json':
            return 'jsonb';
        case 'String':
            return 'text';
        default:
            return prismaType;
    }
}

function extractPrismaDefault(line: string): string | undefined {
    const marker = '@default(';
    const defaultStart = line.indexOf(marker);

    if (defaultStart === -1) {
        return undefined;
    }

    const valueStart = defaultStart + marker.length;
    let depth = 1;

    for (let index = valueStart; index < line.length; index += 1) {
        if (line[index] === '(') {
            depth += 1;
            continue;
        }

        if (line[index] !== ')') {
            continue;
        }

        depth -= 1;
        if (depth === 0) {
            return line.slice(valueStart, index);
        }
    }

    return undefined;
}