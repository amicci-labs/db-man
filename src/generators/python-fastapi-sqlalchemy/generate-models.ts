import type { DatabaseColumn, DatabaseTable } from '../../types.js';
import {
    ensureTrailingNewline,
    escapePythonString,
    extractTypeNumbers,
    generatedHeader,
    isNowDefault,
    isSequenceDefault,
    normalizeSqlType,
    orderImports,
    parseJsonDefault,
    parseLiteralDefault,
    singularize,
    sqlalchemyImportOrder,
    toClassName,
    toPythonIdentifier,
} from './helpers.js';

interface SqlalchemyType {
    expression: string;
}

export function generateModels(tables: DatabaseTable[]): string {
    const imports = new Set(['Column']);
    const classBlocks = tables.map((table) => generateModelClass(table, imports));
    const sqlalchemyImports = orderImports(imports, sqlalchemyImportOrder);

    return ensureTrailingNewline(
        `${generatedHeader}from sqlalchemy import ${sqlalchemyImports.join(', ')}\n\n` +
        'from app.database.database import Base\n\n\n' +
        classBlocks.join('\n\n\n'),
    );
}

function generateModelClass(table: DatabaseTable, imports: Set<string>): string {
    const className = toClassName(singularize(table.name));
    const lines = [`class ${className}(Base):`, `    __tablename__ = "${table.name}"`, ''];
    const tableArguments: string[] = [];

    for (const constraint of table.uniqueConstraints ?? []) {
        imports.add('UniqueConstraint');
        tableArguments.push(`UniqueConstraint(${constraint.map((columnName) => `"${columnName}"`).join(', ')})`);
    }

    for (const constraint of table.checkConstraints ?? []) {
        imports.add('CheckConstraint');
        const name = constraint.name ? `, name="${escapePythonString(constraint.name)}"` : '';
        tableArguments.push(
            `CheckConstraint("${escapePythonString(constraint.expression)}"${name}).ddl_if(dialect="postgresql")`,
        );
    }

    for (const constraint of table.foreignKeys ?? []) {
        imports.add('ForeignKeyConstraint');
        const options = [
            constraint.name ? `name="${escapePythonString(constraint.name)}"` : undefined,
            constraint.onDelete ? `ondelete="${escapePythonString(constraint.onDelete)}"` : undefined,
        ].filter(Boolean);
        const referencedColumns = constraint.referencedColumns
            .map((columnName) => `"${constraint.referencedTable}.${columnName}"`)
            .join(', ');
        tableArguments.push(
            `ForeignKeyConstraint([${constraint.columns.map((columnName) => `"${columnName}"`).join(', ')}], [${referencedColumns}]${options.length ? `, ${options.join(', ')}` : ''})`,
        );
    }

    for (const index of table.indexes ?? []) {
        imports.add('Index');
        const expressions = index.expressions.map((expression) => renderIndexExpression(expression, imports));
        const options = [
            index.unique ? 'unique=True' : undefined,
            index.method ? `postgresql_using="${escapePythonString(index.method)}"` : undefined,
            index.where ? renderIndexWhere(index.where, imports) : undefined,
        ].filter(Boolean);
        tableArguments.push(
            `Index("${escapePythonString(index.name)}", ${[...expressions, ...options].join(', ')}).ddl_if(dialect="postgresql")`,
        );
    }

    if (tableArguments.length) {
        lines.push('    __table_args__ = (');
        lines.push(...tableArguments.map((argument) => `        ${argument},`));
        lines.push('    )', '');
    }

    for (const column of table.columns) {
        lines.push(renderSqlalchemyColumn(column, imports));
    }

    return lines.join('\n');
}

function renderIndexExpression(expression: string, imports: Set<string>): string {
    const simpleMatch = expression.match(/^"?([A-Za-z_][\w$]*)"?$/);
    if (simpleMatch) {
        return `"${simpleMatch[1]}"`;
    }

    const orderedMatch = expression.match(/^"?([A-Za-z_][\w$]*)"?\s+(ASC|DESC)$/i);
    if (orderedMatch) {
        const orderFunction = orderedMatch[2].toLowerCase();
        imports.add(orderFunction);
        return `${orderFunction}("${orderedMatch[1]}")`;
    }

    imports.add('text');
    return `text("${escapePythonString(expression)}")`;
}

function renderIndexWhere(expression: string, imports: Set<string>): string {
    imports.add('text');
    return `postgresql_where=text("${escapePythonString(expression)}")`;
}

function renderSqlalchemyColumn(column: DatabaseColumn, imports: Set<string>): string {
    const attributeName = toPythonIdentifier(column.name);
    const positionalArguments: string[] = [];
    const keywordArguments: string[] = [];
    const sqlalchemyType = resolveSqlalchemyType(column, imports);

    if (attributeName !== column.name) {
        positionalArguments.push(`"${column.name}"`);
    }

    positionalArguments.push(sqlalchemyType.expression);

    if (column.foreignKey) {
        imports.add('ForeignKey');
        const onDelete = column.foreignKey.onDelete ? `, ondelete="${column.foreignKey.onDelete}"` : '';
        positionalArguments.push(`ForeignKey("${column.foreignKey.table}.${column.foreignKey.column}"${onDelete})`);
    }

    if (column.primaryKey) {
        keywordArguments.push('primary_key=True', 'index=True');
    }

    keywordArguments.push(...renderSqlalchemyDefaults(column, imports));

    if (!column.primaryKey) {
        keywordArguments.push(`nullable=${column.nullable ? 'True' : 'False'}`);
    }

    const argumentsList = [...positionalArguments, ...keywordArguments];
    const singleLine = `    ${attributeName} = Column(${argumentsList.join(', ')})`;

    if (singleLine.length <= 99 && argumentsList.length <= 3) {
        return singleLine;
    }

    const [firstArgument, ...remainingArguments] = argumentsList;
    return [
        `    ${attributeName} = Column(`,
        `        ${firstArgument},`,
        ...remainingArguments.map((argument) => `        ${argument},`),
        '    )',
    ].join('\n');
}

function resolveSqlalchemyType(column: DatabaseColumn, imports: Set<string>): SqlalchemyType {
    const normalizedType = normalizeSqlType(column.sqlType);

    if (column.enumName && column.enumValues?.length) {
        imports.add('Enum');
        const values = column.enumValues.map((value) => `"${escapePythonString(value)}"`).join(', ');
        return { expression: `Enum(${values}, name="${escapePythonString(column.enumName)}")` };
    }

    if (normalizedType.endsWith('[]')) {
        imports.add('ARRAY');
        const elementColumn = { ...column, sqlType: normalizedType.slice(0, -2) };
        const elementType = resolveSqlalchemyType(elementColumn, imports);
        return { expression: `ARRAY(${elementType.expression})` };
    }

    const varcharLength = extractTypeNumbers(normalizedType)[0];

    if (/^(bigint|bigserial)\b/.test(normalizedType)) {
        imports.add('BigInteger');
        if (column.primaryKey) {
            imports.add('Integer');
            return { expression: 'BigInteger().with_variant(Integer, "sqlite")' };
        }
        return { expression: 'BigInteger' };
    }

    if (/^(integer|int|int4|serial)\b/.test(normalizedType)) {
        imports.add('Integer');
        return { expression: 'Integer' };
    }

    if (/^(smallint|int2|smallserial)\b/.test(normalizedType)) {
        imports.add('SmallInteger');
        return { expression: 'SmallInteger' };
    }

    if (/^(boolean|bool)\b/.test(normalizedType)) {
        imports.add('Boolean');
        return { expression: 'Boolean' };
    }

    if (/^text\b/.test(normalizedType)) {
        imports.add('Text');
        return { expression: 'Text' };
    }

    if (/^(character varying|varchar|character|char)\b/.test(normalizedType)) {
        imports.add('String');
        return { expression: varcharLength ? `String(${varcharLength})` : 'String' };
    }

    if (/^timestamp with time zone\b/.test(normalizedType) || /^timestamptz\b/.test(normalizedType)) {
        imports.add('DateTime');
        return { expression: 'DateTime(timezone=True)' };
    }

    if (/^timestamp/.test(normalizedType)) {
        imports.add('DateTime');
        return { expression: 'DateTime(timezone=False)' };
    }

    if (/^date\b/.test(normalizedType)) {
        imports.add('Date');
        return { expression: 'Date' };
    }

    if (/^time\b/.test(normalizedType)) {
        imports.add('Time');
        return { expression: 'Time' };
    }

    if (/^(numeric|decimal)\b/.test(normalizedType)) {
        imports.add('Numeric');
        const numericParts = extractTypeNumbers(normalizedType);
        return { expression: numericParts.length ? `Numeric(${numericParts.join(', ')})` : 'Numeric' };
    }

    if (/^(double precision|real)\b/.test(normalizedType)) {
        imports.add('Float');
        return { expression: 'Float' };
    }

    if (/^(json|jsonb)\b/.test(normalizedType)) {
        imports.add('JSON');
        return { expression: 'JSON' };
    }

    if (/^uuid\b/.test(normalizedType)) {
        imports.add('Uuid');
        return { expression: 'Uuid' };
    }

    if (/^(bytea|binary)\b/.test(normalizedType)) {
        imports.add('LargeBinary');
        return { expression: 'LargeBinary' };
    }

    imports.add('Text');
    return { expression: 'Text' };
}

function renderSqlalchemyDefaults(column: DatabaseColumn, imports: Set<string>): string[] {
    if (!column.defaultValue || isSequenceDefault(column.defaultValue)) {
        return [];
    }

    if (isNowDefault(column.defaultValue)) {
        imports.add('func');
        const defaults = ['server_default=func.now()'];
        if (column.name === 'updated_at') {
            defaults.push('onupdate=func.now()');
        }
        return defaults;
    }

    const jsonDefault = parseJsonDefault(column.defaultValue);
    if (jsonDefault) {
        return [`default=${jsonDefault}`];
    }

    const literalDefault = parseLiteralDefault(column.defaultValue);
    if (literalDefault !== undefined) {
        return [`default=${literalDefault}`];
    }

    imports.add('text');
    return [`server_default=text("${escapePythonString(column.defaultValue)}")`];
}
