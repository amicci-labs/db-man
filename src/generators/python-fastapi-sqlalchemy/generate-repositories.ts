import type { DatabaseColumn, DatabaseTable, GeneratedFile } from '../../types.js';
import {
    ensureTrailingNewline,
    generatedHeader,
    normalizeSqlType,
    singularize,
    toClassName,
    toPythonIdentifier,
    toSnakeCase,
} from './helpers.js';

export function generateRepositories(tables: DatabaseTable[]): GeneratedFile[] {
    return tables.map((table) => ({
        content: generateRepository(table),
        path: `app/repositories/${toSnakeCase(singularize(table.name))}_repository.py`,
    }));
}

function generateRepository(table: DatabaseTable): string {
    const className = toClassName(singularize(table.name));
    const singularName = toSnakeCase(singularize(table.name));
    const pluralName = toSnakeCase(table.name);
    const repositoryClassName = `${className}Repository`;
    const primaryKey = table.columns.find((column) => column.primaryKey) ?? table.columns[0];
    const primaryKeyAttribute = toPythonIdentifier(primaryKey.name);
    const primaryKeyParameter = primaryKey.name === 'id' ? `${singularName}_id` : `${singularName}_${primaryKeyAttribute}`;
    const primaryKeyType = resolveRepositoryParameterType(primaryKey);
    const orderColumn = table.columns.find((column) => column.name === 'created_at') ?? primaryKey;
    const orderMethod = orderColumn.name === 'created_at' ? 'desc' : 'asc';

    return ensureTrailingNewline(`${generatedHeader}import logging
from typing import Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import ${className}
from app.database.schemas import ${className}Create, ${className}Update


class ${repositoryClassName}:
    def __init__(self, session: Session):
        self.logger = logging.getLogger(__name__)
        self.session = session

    def list_${pluralName}(self) -> list[${className}]:
        return self.session.query(${className}).order_by(${className}.${toPythonIdentifier(orderColumn.name)}.${orderMethod}()).all()

    def get_${singularName}(self, ${primaryKeyParameter}: ${primaryKeyType}) -> Optional[${className}]:
        return self.session.query(${className}).filter_by(${primaryKeyAttribute}=${primaryKeyParameter}).first()

    def create_${singularName}(self, payload: ${className}Create) -> ${className}:
        ${singularName} = ${className}(**payload.model_dump())
        self.session.add(${singularName})
        self.session.commit()
        self.session.refresh(${singularName})
        return ${singularName}

    def update_${singularName}(self, ${singularName}: ${className}, payload: ${className}Update) -> ${className}:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(${singularName}, field, value)
        self.session.add(${singularName})
        self.session.commit()
        self.session.refresh(${singularName})
        return ${singularName}

    def delete_${singularName}(self, ${singularName}: ${className}) -> None:
        self.session.delete(${singularName})
        self.session.commit()


def get_${singularName}_repository(session: Session = Depends(get_db)) -> ${repositoryClassName}:
    return ${repositoryClassName}(session=session)
`);
}

function resolveRepositoryParameterType(column: DatabaseColumn): string {
    const normalizedType = normalizeSqlType(column.sqlType);

    if (/^(bigint|bigserial|integer|int|int4|serial|smallint|int2|smallserial)\b/.test(normalizedType)) {
        return 'int';
    }

    return 'str';
}
