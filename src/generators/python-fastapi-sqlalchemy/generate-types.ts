import type { DatabaseColumn, DatabaseTable } from '../../types.js';
import {
    ensureTrailingNewline,
    extractTypeNumbers,
    generatedHeader,
    isEditableColumn,
    isSequenceDefault,
    normalizeSqlType,
    parseLiteralDefault,
    singularize,
    toClassName,
    toPythonIdentifier,
} from './helpers.js';

interface PydanticImports {
    date: boolean;
    datetime: boolean;
    decimal: boolean;
    field: boolean;
    optional: boolean;
    uuid: boolean;
}

export function generateTypes(tables: DatabaseTable[]): string {
    const imports: PydanticImports = {
        date: false,
        datetime: false,
        decimal: false,
        field: false,
        optional: false,
        uuid: false,
    };
    const schemaBlocks = tables.map((table) => generateSchemaClasses(table, imports));
    const importLines = renderImportLines(imports);

    return ensureTrailingNewline(`${generatedHeader}${importLines.join('\n')}\n\n\n${schemaBlocks.join('\n\n\n')}`);
}

function renderImportLines(imports: PydanticImports): string[] {
    const importLines: string[] = [];
    const datetimeImports: string[] = [];

    if (imports.date) {
        datetimeImports.push('date');
    }

    if (imports.datetime) {
        datetimeImports.push('datetime');
    }

    if (datetimeImports.length) {
        importLines.push(`from datetime import ${datetimeImports.join(', ')}`);
    }

    if (imports.decimal) {
        importLines.push('from decimal import Decimal');
    }

    if (imports.optional) {
        importLines.push('from typing import Optional');
    }

    if (imports.uuid) {
        importLines.push('from uuid import UUID');
    }

    const pydanticImports = ['BaseModel', 'ConfigDict'];
    if (imports.field) {
        pydanticImports.push('Field');
    }
    importLines.push(`from pydantic import ${pydanticImports.join(', ')}`);

    return importLines;
}

function generateSchemaClasses(table: DatabaseTable, imports: PydanticImports): string {
    const className = toClassName(singularize(table.name));
    const editableColumns = table.columns.filter((column) => isEditableColumn(column));
    const readOnlyColumns = table.columns.filter((column) => !isEditableColumn(column));
    const lines = [`class ${className}Base(BaseModel):`];

    if (editableColumns.length) {
        for (const column of editableColumns) {
            lines.push(renderPydanticField(column, 'base', imports));
        }
    } else {
        lines.push('    pass');
    }

    lines.push('', '', `class ${className}Create(${className}Base):`, '    pass');
    lines.push('', '', `class ${className}Update(BaseModel):`);

    if (editableColumns.length) {
        for (const column of editableColumns) {
            lines.push(renderPydanticField(column, 'update', imports));
        }
    } else {
        lines.push('    pass');
    }

    lines.push('', '', `class ${className}InDB(${className}Base):`);

    if (readOnlyColumns.length) {
        for (const column of readOnlyColumns) {
            lines.push(renderPydanticField(column, 'read', imports));
        }
    }

    lines.push('', '    model_config = ConfigDict(from_attributes=True)');

    return lines.join('\n');
}

function renderPydanticField(column: DatabaseColumn, mode: 'base' | 'read' | 'update', imports: PydanticImports): string {
    const attributeName = toPythonIdentifier(column.name);
    const baseType = resolvePydanticType(column, imports);
    const optional = mode === 'update' || column.nullable;
    const annotation = optional ? `Optional[${baseType}]` : baseType;
    const fieldArguments = renderFieldArguments(column, mode);
    const literalDefault = mode === 'update' ? 'None' : parseLiteralDefault(column.defaultValue);
    imports.optional ||= optional;

    if (fieldArguments.length) {
        imports.field = true;
        return `    ${attributeName}: ${annotation} = Field(${fieldArguments.join(', ')})`;
    }

    if (mode === 'update' || column.nullable) {
        return `    ${attributeName}: ${annotation} = None`;
    }

    if (literalDefault !== undefined && !isSequenceDefault(column.defaultValue)) {
        return `    ${attributeName}: ${annotation} = ${literalDefault}`;
    }

    return `    ${attributeName}: ${annotation}`;
}

function renderFieldArguments(column: DatabaseColumn, mode: 'base' | 'read' | 'update'): string[] {
    const normalizedType = normalizeSqlType(column.sqlType);
    const argumentsList: string[] = [];
    const isString = /^(text|character varying|varchar|character|char)\b/.test(normalizedType);
    const maxLength = /^(character varying|varchar|character|char)\b/.test(normalizedType)
        ? extractTypeNumbers(normalizedType)[0]
        : undefined;

    if (!isString) {
        return argumentsList;
    }

    if (mode === 'update') {
        argumentsList.push('default=None');
    }

    if (!column.nullable) {
        argumentsList.push('min_length=1');
    }

    if (maxLength) {
        argumentsList.push(`max_length=${maxLength}`);
    }

    return argumentsList;
}

function resolvePydanticType(column: DatabaseColumn, imports: PydanticImports): string {
    const normalizedType = normalizeSqlType(column.sqlType);

    if (normalizedType.endsWith('[]')) {
        const elementColumn = { ...column, sqlType: normalizedType.slice(0, -2) };
        return `list[${resolvePydanticType(elementColumn, imports)}]`;
    }

    if (/^(bigint|bigserial|integer|int|int4|serial|smallint|int2|smallserial)\b/.test(normalizedType)) {
        return 'int';
    }

    if (/^(boolean|bool)\b/.test(normalizedType)) {
        return 'bool';
    }

    if (/^(text|character varying|varchar|character|char|time)\b/.test(normalizedType)) {
        return 'str';
    }

    if (/^timestamp/.test(normalizedType) || /^timestamptz\b/.test(normalizedType)) {
        imports.datetime = true;
        return 'datetime';
    }

    if (/^date\b/.test(normalizedType)) {
        imports.date = true;
        return 'date';
    }

    if (/^(numeric|decimal)\b/.test(normalizedType)) {
        imports.decimal = true;
        return 'Decimal';
    }

    if (/^(double precision|real)\b/.test(normalizedType)) {
        return 'float';
    }

    if (/^(json|jsonb)\b/.test(normalizedType)) {
        return 'dict';
    }

    if (/^uuid\b/.test(normalizedType)) {
        imports.uuid = true;
        return 'UUID';
    }

    if (/^(bytea|binary)\b/.test(normalizedType)) {
        return 'bytes';
    }

    return 'str';
}
