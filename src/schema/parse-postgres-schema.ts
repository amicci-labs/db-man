import type {
    DatabaseCheckConstraint,
    DatabaseColumn,
    DatabaseForeignKeyConstraint,
    DatabaseTable,
} from '../types.js';

export function parsePostgresSchema(schemaSql: string): DatabaseTable[] {
    const tables = new Map<string, DatabaseTable>();
    const enums = parseEnums(schemaSql);
    const createTablePattern = /CREATE TABLE\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)\s*\(([\s\S]*?)\n\);/gi;

    for (const match of schemaSql.matchAll(createTablePattern)) {
        const tableName = parseIdentifier(match[1]);
        const tableBody = match[2];

        const table: DatabaseTable = {
            checkConstraints: parseInlineCheckConstraints(tableBody),
            columns: parseColumnDefinitions(tableBody),
            name: tableName,
            uniqueConstraints: parseInlineUniqueConstraints(tableBody),
        };
        for (const constraint of parseInlineForeignKeys(tableBody)) {
            applyForeignKeyConstraint(table, constraint);
        }
        tables.set(tableName, table);
    }

    applyEnums(tables, enums);
    applyPrimaryKeys(schemaSql, tables);
    applyAlteredDefaults(schemaSql, tables);
    applyUniqueConstraints(schemaSql, tables);
    applyForeignKeys(schemaSql, tables);
    applyAlteredCheckConstraints(schemaSql, tables);
    applyIndexes(schemaSql, tables);

    return [...tables.values()];
}

function parseEnums(schemaSql: string): Map<string, string[]> {
    const enums = new Map<string, string[]>();
    const enumPattern = /CREATE TYPE\s+(.+?)\s+AS ENUM\s*\(([\s\S]*?)\);/gi;

    for (const match of schemaSql.matchAll(enumPattern)) {
        enums.set(
            parseIdentifier(match[1]),
            splitSqlList(match[2]).map((value) => parseSqlString(value.trim())),
        );
    }

    return enums;
}

function applyEnums(tables: Map<string, DatabaseTable>, enums: Map<string, string[]>): void {
    for (const table of tables.values()) {
        for (const column of table.columns) {
            const enumName = parseIdentifier(column.sqlType);
            const enumValues = enums.get(enumName);
            if (enumValues) {
                column.enumName = enumName;
                column.enumValues = enumValues;
            }
        }
    }
}

function applyUniqueConstraints(schemaSql: string, tables: Map<string, DatabaseTable>): void {
    const uniquePattern = /ALTER TABLE ONLY\s+(.+?)\s+ADD CONSTRAINT\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+UNIQUE\s*\(([\s\S]*?)\);/gi;

    for (const match of schemaSql.matchAll(uniquePattern)) {
        const table = tables.get(parseIdentifier(match[1]));
        if (table) {
            table.uniqueConstraints ??= [];
            table.uniqueConstraints.push(splitSqlList(match[2]).map((columnName) => parseIdentifier(columnName)));
        }
    }
}

function applyForeignKeys(schemaSql: string, tables: Map<string, DatabaseTable>): void {
    const foreignKeyPattern = /ALTER TABLE ONLY\s+(.+?)\s+ADD CONSTRAINT\s+("[^"]+"|[A-Za-z_][\w$]*)\s+FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+(.+?)\s*\(([^)]+)\)(?:\s+ON DELETE\s+(RESTRICT|CASCADE|SET NULL|SET DEFAULT|NO ACTION))?[\s\S]*?;/gi;

    for (const match of schemaSql.matchAll(foreignKeyPattern)) {
        const table = tables.get(parseIdentifier(match[1]));
        const localColumns = splitSqlList(match[3]).map((column) => parseIdentifier(column));
        const referencedColumns = splitSqlList(match[5]).map((column) => parseIdentifier(column));

        if (!table || localColumns.length !== referencedColumns.length) {
            continue;
        }

        applyForeignKeyConstraint(table, {
            columns: localColumns,
            name: parseIdentifier(match[2]),
            onDelete: match[6]?.trim(),
            referencedColumns,
            referencedTable: parseIdentifier(match[4]),
        });
    }
}

function applyForeignKeyConstraint(table: DatabaseTable, constraint: DatabaseForeignKeyConstraint): void {
    if (constraint.columns.length === 1) {
        const column = table.columns.find((candidateColumn) => candidateColumn.name === constraint.columns[0]);
        if (column) {
            column.foreignKey = {
                column: constraint.referencedColumns[0],
                onDelete: constraint.onDelete,
                table: constraint.referencedTable,
            };
        }
        return;
    }

    table.foreignKeys ??= [];
    table.foreignKeys.push(constraint);
}

function parseInlineCheckConstraints(tableBody: string): DatabaseCheckConstraint[] {
    return splitSqlList(tableBody)
        .map((definition) => parseCheckConstraint(definition.trim()))
        .filter((constraint): constraint is DatabaseCheckConstraint => Boolean(constraint));
}

function parseInlineUniqueConstraints(tableBody: string): string[][] {
    const constraints: string[][] = [];

    for (const definition of splitSqlList(tableBody).map((value) => value.trim())) {
        const tableMatch = definition.match(/^(?:CONSTRAINT\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+)?UNIQUE\s*\(([\s\S]*?)\)$/i);
        if (tableMatch) {
            constraints.push(splitSqlList(tableMatch[1]).map((columnName) => parseIdentifier(columnName)));
            continue;
        }

        if (/\bUNIQUE\b/i.test(definition)) {
            const columnMatch = definition.match(/^("[^"]+"|[A-Za-z_][\w$]*)\s+/);
            if (columnMatch) {
                constraints.push([parseIdentifier(columnMatch[1])]);
            }
        }
    }

    return constraints;
}

function parseInlineForeignKeys(tableBody: string): DatabaseForeignKeyConstraint[] {
    const constraints: DatabaseForeignKeyConstraint[] = [];

    for (const definition of splitSqlList(tableBody).map((value) => value.trim())) {
        const tableMatch = definition.match(
            /^(?:CONSTRAINT\s+("[^"]+"|[A-Za-z_][\w$]*)\s+)?FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+(.+?)\s*\(([^)]+)\)(?:\s+ON DELETE\s+(RESTRICT|CASCADE|SET NULL|SET DEFAULT|NO ACTION))?/i,
        );
        if (tableMatch) {
            constraints.push({
                columns: splitSqlList(tableMatch[2]).map((columnName) => parseIdentifier(columnName)),
                name: tableMatch[1] ? parseIdentifier(tableMatch[1]) : undefined,
                onDelete: tableMatch[5]?.toUpperCase(),
                referencedColumns: splitSqlList(tableMatch[4]).map((columnName) => parseIdentifier(columnName)),
                referencedTable: parseIdentifier(tableMatch[3]),
            });
            continue;
        }

        const columnMatch = definition.match(
            /^("[^"]+"|[A-Za-z_][\w$]*)\s+[\s\S]*?\bREFERENCES\s+(.+?)\s*\(([^)]+)\)(?:\s+ON DELETE\s+(RESTRICT|CASCADE|SET NULL|SET DEFAULT|NO ACTION))?/i,
        );
        if (columnMatch) {
            constraints.push({
                columns: [parseIdentifier(columnMatch[1])],
                onDelete: columnMatch[4]?.toUpperCase(),
                referencedColumns: [parseIdentifier(columnMatch[3])],
                referencedTable: parseIdentifier(columnMatch[2]),
            });
        }
    }

    return constraints;
}

function applyAlteredCheckConstraints(schemaSql: string, tables: Map<string, DatabaseTable>): void {
    const checkPattern = /ALTER TABLE ONLY\s+(.+?)\s+ADD CONSTRAINT\s+("[^"]+"|[A-Za-z_][\w$]*)\s+CHECK\s*\(([\s\S]*?)\);/gi;

    for (const match of schemaSql.matchAll(checkPattern)) {
        const table = tables.get(parseIdentifier(match[1]));
        if (table) {
            table.checkConstraints ??= [];
            table.checkConstraints.push({
                expression: match[3].trim(),
                name: parseIdentifier(match[2]),
            });
        }
    }
}

function parseCheckConstraint(definition: string): DatabaseCheckConstraint | undefined {
    const namedMatch = definition.match(/^CONSTRAINT\s+("[^"]+"|[A-Za-z_][\w$]*)\s+CHECK\s*\(([\s\S]*)\)$/i);
    if (namedMatch) {
        return { expression: namedMatch[2].trim(), name: parseIdentifier(namedMatch[1]) };
    }

    const unnamedMatch = definition.match(/^CHECK\s*\(([\s\S]*)\)$/i);
    if (unnamedMatch) {
        return { expression: unnamedMatch[1].trim() };
    }

    const columnMatch = definition.match(
        /\b(?:CONSTRAINT\s+("[^"]+"|[A-Za-z_][\w$]*)\s+)?CHECK\s*\(([\s\S]*)\)$/i,
    );
    return columnMatch
        ? { expression: columnMatch[2].trim(), name: columnMatch[1] ? parseIdentifier(columnMatch[1]) : undefined }
        : undefined;
}

function applyIndexes(schemaSql: string, tables: Map<string, DatabaseTable>): void {
    const indexPattern = /CREATE\s+(UNIQUE\s+)?INDEX\s+("[^"]+"|[A-Za-z_][\w$]*)\s+ON\s+(.+?)(?:\s+USING\s+([A-Za-z_][\w$]*))?\s*\(([\s\S]*?)\)(?:\s+WHERE\s+([\s\S]*?))?;/gi;

    for (const match of schemaSql.matchAll(indexPattern)) {
        const table = tables.get(parseIdentifier(match[3]));
        if (table) {
            table.indexes ??= [];
            table.indexes.push({
                expressions: splitSqlList(match[5]).map((expression) => expression.trim()),
                method: match[4]?.toLowerCase(),
                name: parseIdentifier(match[2]),
                unique: Boolean(match[1]),
                where: match[6]?.trim(),
            });
        }
    }
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

function parseSqlString(value: string): string {
    const match = value.match(/^'(.*)'$/s);
    return match ? match[1].replace(/''/g, "'") : value;
}
