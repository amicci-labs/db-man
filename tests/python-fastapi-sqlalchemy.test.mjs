import assert from 'node:assert/strict';
import test from 'node:test';

import { generateModels } from '../dist/generators/python-fastapi-sqlalchemy/generate-models.js';
import { generateRepositories } from '../dist/generators/python-fastapi-sqlalchemy/generate-repositories.js';
import { generateTypes } from '../dist/generators/python-fastapi-sqlalchemy/generate-types.js';
import { parsePostgresSchema } from '../dist/schema/parse-postgres-schema.js';

const schemaSql = `
CREATE TYPE public.analysis_status AS ENUM (
    'draft',
    'approved'
);
CREATE TABLE public.credit_analysis (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    status public.analysis_status DEFAULT 'draft'::public.analysis_status NOT NULL,
    CONSTRAINT credit_analysis_status_not_blank CHECK ((status::text <> ''::text))
);
CREATE TABLE public.company_legal_data (
    id bigint NOT NULL,
    credit_analysis_id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    external_id text UNIQUE,
    parent_id bigint REFERENCES public.credit_analysis(id) ON DELETE SET NULL,
    partners jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT company_legal_data_tenant_analysis_fk FOREIGN KEY (tenant_id, credit_analysis_id) REFERENCES public.credit_analysis(tenant_id, id) ON DELETE CASCADE
);
ALTER TABLE ONLY public.credit_analysis
    ADD CONSTRAINT credit_analysis_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.credit_analysis
    ADD CONSTRAINT credit_analysis_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE ONLY public.company_legal_data
    ADD CONSTRAINT company_legal_data_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.company_legal_data
    ADD CONSTRAINT company_legal_data_analysis_unique UNIQUE (credit_analysis_id);
ALTER TABLE ONLY public.company_legal_data
    ADD CONSTRAINT company_legal_data_analysis_fk FOREIGN KEY (credit_analysis_id) REFERENCES public.credit_analysis(id) ON DELETE RESTRICT;
CREATE INDEX credit_analysis_status_idx ON public.credit_analysis USING btree (status, id DESC);
CREATE UNIQUE INDEX company_legal_data_tenant_idx ON public.company_legal_data USING btree (tenant_id) WHERE (tenant_id > 0);
`;

test('python-fastapi-sqlalchemy preserves PostgreSQL persistence semantics', () => {
    const tables = parsePostgresSchema(schemaSql);
    const models = generateModels(tables);
    const schemas = generateTypes(tables);
    const repositories = generateRepositories(tables).map((file) => file.content).join('\n');

    assert.match(models, /ForeignKey\("credit_analysis.id", ondelete="RESTRICT"\)/);
    assert.match(models, /ForeignKey\("credit_analysis.id", ondelete="SET NULL"\)/);
    assert.match(models, /ForeignKeyConstraint\(\["tenant_id", "credit_analysis_id"\], \["credit_analysis.tenant_id", "credit_analysis.id"\], name="company_legal_data_tenant_analysis_fk", ondelete="CASCADE"\)/);
    assert.match(models, /UniqueConstraint\("credit_analysis_id"\)/);
    assert.match(models, /UniqueConstraint\("external_id"\)/);
    assert.match(models, /CheckConstraint\("\(status::text <> ''::text\)", name="credit_analysis_status_not_blank"\)\.ddl_if\(dialect="postgresql"\)/);
    assert.match(models, /Index\("credit_analysis_status_idx", "status", desc\("id"\), postgresql_using="btree"\)\.ddl_if\(dialect="postgresql"\)/);
    assert.match(models, /Index\("company_legal_data_tenant_idx", "tenant_id", unique=True, postgresql_using="btree", postgresql_where=text\("\(tenant_id > 0\)"\)\)\.ddl_if\(dialect="postgresql"\)/);
    assert.match(models, /Enum\("draft", "approved", name="analysis_status"\)/);
    assert.match(models, /default="draft"/);
    assert.match(models, /public_id = Column\(Uuid, server_default=text\("gen_random_uuid\(\)"\), nullable=False\)/);
    assert.match(models, /partners = Column\(JSON, default=list, nullable=False\)/);

    assert.match(schemas, /status: Literal\["draft", "approved"\] = "draft"/);
    assert.match(schemas, /partners: list\[object\] = Field\(default_factory=list\)/);
    assert.match(schemas, /public_id: UUID/);
    assert.doesNotMatch(schemas, /default=None, default=None/);

    assert.doesNotMatch(repositories, /fastapi|Depends|get_db/);
    assert.match(repositories, /payload\.model_dump\(exclude_unset=True\)/);
});
