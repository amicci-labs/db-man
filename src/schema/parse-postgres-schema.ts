import type { DatabaseColumn, DatabaseTable } from '../types.js';

export function parsePostgresSchema(schemaSql: string): DatabaseTable[] {
    const tables = new Map<string, DatabaseTable>();
    const createTablePattern = /CREATE TABLE\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)\s*\(([\s\S]*?)\n\);/gi;

    for (const match of schemaSql.matchAll(createTablePattern)) {
        const tableName = parseIdentifier(match[1]);
        const tableBody = match[2];

        tables.set(tableName, {
            columns: parseColumnDefinitions(tableBody),
            name: tableName,
        });
    }

    applyPrimaryKeys(schemaSql, tables);
    applyAlteredDefaults(schemaSql, tables);

    return [...tables.values()];
}

function parseColumnDefinitions(tableBody: string): DatabaseColumn[] {
    return splitSqlList(tableBody)
        .map((definition) => definition.trim())
        .filter(Boolean)
        .filter((definition) => !isTableConstraint(definition))
        .map(parseColumnDefinition)
        .filter((column): column is DatabaseColumn => Boolean(column));
}

function isTableConstraint(definition: string): boolean {
    return /^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(definition);
}

function parseColumnDefinition(definition: string): DatabaseColumn | undefined {
    const columnMatch = definition.match(/^("[^"]+"|[A-Za-z_][\w$]*)\s+([\s\S]+)$/);
    if (!columnMatch) {
        return undefined;
    }

    const columnName = parseIdentifier(columnMatch[1]);
    const remainder = columnMatch[2].trim();
    const constraintMatch = remainder.match(
        /\s(DEFAULT|NOT\s+NULL|NULL|CONSTRAINT|PRIMARY\s+KEY|REFERENCES|CHECK|UNIQUE|COLLATE|GENERATED|IDENTITY)\b/i,
    );
    const sqlType = (constraintMatch ? remainder.slice(0, constraintMatch.index) : remainder).trim();
    const defaultValue = extractDefault(remainder);

    return {
        defaultValue,
        name: columnName,
        nullable: !/\bNOT\s+NULL\b/i.test(remainder),
        primaryKey: /\bPRIMARY\s+KEY\b/i.test(remainder),
        sqlType,
    };
}

function extractDefault(remainder: string): string | undefined {
    const defaultMatch = remainder.match(
        /\bDEFAULT\s+([\s\S]+?)(?=\s+NOT\s+NULL|\s+NULL|\s+CONSTRAINT|\s+PRIMARY\s+KEY|\s+REFERENCES|\s+CHECK|\s+UNIQUE|\s+COLLATE|$)/i,
    );

    return defaultMatch ? defaultMatch[1].trim() : undefined;
}

function applyPrimaryKeys(schemaSql: string, tables: Map<string, DatabaseTable>): void {
    const primaryKeyPattern = /ALTER TABLE ONLY\s+(.+?)\s+ADD CONSTRAINT\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+PRIMARY KEY\s*\(([\s\S]*?)\);/gi;

    for (const match of schemaSql.matchAll(primaryKeyPattern)) {
        const tableName = parseIdentifier(match[1]);
        const table = tables.get(tableName);
        if (!table) {
            continue;
        }

        const primaryKeyColumns = splitSqlList(match[2]).map((columnName) => parseIdentifier(columnName));
        for (const column of table.columns) {
            column.primaryKey = primaryKeyColumns.includes(column.name);
        }
    }
}

function applyAlteredDefaults(schemaSql: string, tables: Map<string, DatabaseTable>): void {
    const defaultPattern = /ALTER TABLE ONLY\s+(.+?)\s+ALTER COLUMN\s+("[^"]+"|[A-Za-z_][\w$]*)\s+SET DEFAULT\s+([\s\S]*?);/gi;

    for (const match of schemaSql.matchAll(defaultPattern)) {
        const tableName = parseIdentifier(match[1]);
        const columnName = parseIdentifier(match[2]);
        const table = tables.get(tableName);
        const column = table?.columns.find((candidateColumn) => candidateColumn.name === columnName);

        if (column) {
            column.defaultValue = match[3].trim();
        }
    }
}

function splitSqlList(value: string): string[] {
    const items: string[] = [];
    let currentItem = '';
    let parenthesisDepth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let characterIndex = 0; characterIndex < value.length; characterIndex += 1) {
        const character = value[characterIndex];
        const nextCharacter = value[characterIndex + 1];

        if (character === "'" && !inDoubleQuote) {
            currentItem += character;
            if (inSingleQuote && nextCharacter === "'") {
                currentItem += nextCharacter;
                characterIndex += 1;
                continue;
            }
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (character === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
            currentItem += character;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote) {
            if (character === '(') {
                parenthesisDepth += 1;
            }

            if (character === ')') {
                parenthesisDepth -= 1;
            }

            if (character === ',' && parenthesisDepth === 0) {
                items.push(currentItem);
                currentItem = '';
                continue;
            }
        }

        currentItem += character;
    }

    if (currentItem.trim()) {
        items.push(currentItem);
    }

    return items;
}

function parseIdentifier(value: string): string {
    const parts = value
        .trim()
        .replace(/;$/, '')
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean);
    const identifier = parts.at(-1) ?? value.trim();

    if (identifier.startsWith('"') && identifier.endsWith('"')) {
        return identifier.slice(1, -1).replace(/""/g, '"');
    }

    return identifier;
}
