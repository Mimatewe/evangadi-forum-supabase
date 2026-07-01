-- ============================================================
-- Evangadi Forum — Supabase PostgreSQL migration
-- File: backend/db/supabase_schema.sql
--
-- Run this in the Supabase dashboard SQL Editor.
-- It converts the old MySQL schema (backend/db/schema.sql) to PostgreSQL
-- and enables pgvector for native RAG semantic search.
-- ============================================================

-- pgvector: required for the VECTOR column type and the <=> cosine-distance
-- operator used by the RAG semantic-search services.
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop in dependency order (children first) for clean re-runs.
-- CASCADE removes dependent indexes/constraints automatically.
DROP TABLE IF EXISTS document_chunk_vectors CASCADE;
DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS answer_votes CASCADE;
DROP TABLE IF EXISTS question_vectors CASCADE;
DROP TABLE IF EXISTS question_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- Core forum tables
-- ============================================================

-- users
-- PostgreSQL: SERIAL replaces MySQL AUTO_INCREMENT.
-- TIMESTAMPTZ stores timezone-aware timestamps (better than MySQL DATETIME).
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    first_name     VARCHAR(50) NOT NULL,
    last_name      VARCHAR(50) NOT NULL,
    email          VARCHAR(320) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_lowercase CHECK (email = LOWER(email))
);
CREATE INDEX idx_users_email ON users (email);

-- questions
-- PostgreSQL: TEXT replaces MySQL LONGTEXT for unbounded text.
-- The MySQL FULLTEXT index is replaced by a PostgreSQL GIN tsvector index.
CREATE TABLE questions (
    question_id         SERIAL PRIMARY KEY,
    question_hash       CHAR(16) NOT NULL UNIQUE,
    user_id             INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title               VARCHAR(255) NOT NULL,
    content             TEXT NOT NULL,
    accepted_answer_id  INT DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT title_length   CHECK (char_length(title)   >= 5),
    CONSTRAINT content_length CHECK (char_length(content) >= 10)
);
CREATE INDEX idx_questions_user_id    ON questions (user_id);
CREATE INDEX idx_questions_created_at ON questions (created_at);
-- Full-text search index (PostgreSQL equivalent of MySQL FULLTEXT KEY).
CREATE INDEX ft_questions_search ON questions
    USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- tags
CREATE TABLE tags (
    tag_id      SERIAL PRIMARY KEY,
    name        VARCHAR(40) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tag_name_lower  CHECK (name = LOWER(name)),
    CONSTRAINT tag_name_format CHECK (name ~ '^[a-z0-9][a-z0-9-]{1,39}$')
);
CREATE INDEX idx_tags_name ON tags (name);

-- question_tags (many-to-many join)
-- PostgreSQL: composite PRIMARY KEY replaces MySQL PRIMARY KEY (a, b).
CREATE TABLE question_tags (
    question_id  INT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    tag_id       INT NOT NULL REFERENCES tags(tag_id)           ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (question_id, tag_id)
);
CREATE INDEX idx_question_tags_tag_id ON question_tags (tag_id);

-- ============================================================
-- Question vectors (RAG — pgvector)
-- ============================================================
-- embedding uses the native VECTOR type.
-- Gemini's "gemini-embedding-001" model returns 768-dimensional vectors,
-- so VECTOR(768) is the correct column type. If you switch embedding
-- models, update this dimension to match the new model's output.
-- pgvector operators:
--   <=>  cosine distance   (0 = identical, 2 = opposite)  -- used here
--   <->  L2 / Euclidean distance
--   <#>  negative inner product
CREATE TABLE question_vectors (
    vector_id     SERIAL PRIMARY KEY,
    question_id   INT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    source_text   TEXT NOT NULL,
    embedding     VECTOR(768),
    status        VARCHAR(20) NOT NULL DEFAULT 'processing',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT qv_status_check CHECK (status IN ('processing','ready','failed'))
);
CREATE INDEX idx_question_vectors_question_id ON question_vectors (question_id);
CREATE INDEX idx_question_vectors_status      ON question_vectors (status);
-- HNSW index for fast approximate cosine similarity search.
CREATE INDEX idx_question_vectors_embedding ON question_vectors
    USING hnsw (embedding vector_cosine_ops);

-- answers
CREATE TABLE answers (
    answer_id    SERIAL PRIMARY KEY,
    question_id  INT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    user_id      INT NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
    content      TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_answers_question_id ON answers (question_id);
CREATE INDEX idx_answers_user_id     ON answers (user_id);
CREATE INDEX idx_answers_created_at  ON answers (created_at);

-- questions.accepted_answer_id references answers, so it is added AFTER
-- the answers table exists (same pattern as the MySQL ALTER TABLE).
ALTER TABLE questions
    ADD CONSTRAINT fk_questions_accepted_answer
    FOREIGN KEY (accepted_answer_id) REFERENCES answers(answer_id) ON DELETE SET NULL;

-- answer_votes
-- value is SMALLINT (MySQL used TINYINT; PostgreSQL has no TINYINT).
CREATE TABLE answer_votes (
    answer_id   INT NOT NULL REFERENCES answers(answer_id) ON DELETE CASCADE,
    user_id     INT NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    value       SMALLINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (answer_id, user_id),
    CONSTRAINT vote_value_check CHECK (value IN (-1, 1))
);
CREATE INDEX idx_answer_votes_user_id ON answer_votes (user_id);

-- ============================================================
-- RAG document tables
-- ============================================================

CREATE TABLE documents (
    document_id    SERIAL PRIMARY KEY,
    user_id        INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title          VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    byte_size      INT NOT NULL DEFAULT 0,
    storage_path   VARCHAR(500) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'processing',
    error_message  TEXT DEFAULT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT doc_status_check CHECK (status IN ('processing','ready','failed'))
);
CREATE INDEX idx_documents_user_id ON documents (user_id);
CREATE INDEX idx_documents_status  ON documents (status);

CREATE TABLE document_chunks (
    chunk_id      SERIAL PRIMARY KEY,
    document_id   INT NOT NULL REFERENCES documents(document_id) ON DELETE CASCADE,
    chunk_index   INT NOT NULL,
    content       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chunks_document_id ON document_chunks (document_id);

-- Chunk embeddings use pgvector VECTOR type for native similarity search.
CREATE TABLE document_chunk_vectors (
    vector_id      SERIAL PRIMARY KEY,
    chunk_id       INT NOT NULL REFERENCES document_chunks(chunk_id)  ON DELETE CASCADE,
    document_id    INT NOT NULL REFERENCES documents(document_id)     ON DELETE CASCADE,
    embedding      VECTOR(768) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chunk_vectors_document_id ON document_chunk_vectors (document_id);
CREATE INDEX idx_chunk_vectors_chunk_id    ON document_chunk_vectors (chunk_id);
CREATE INDEX idx_chunk_vectors_embedding ON document_chunk_vectors
    USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- Verification queries (run manually after creating the schema)
-- ============================================================
-- Confirm pgvector is enabled:
--   SELECT extname FROM pg_extension WHERE extname = 'vector';
-- Confirm a vector column works:
--   SELECT '[0.1,0.2,0.3]'::vector(3);
-- Confirm the health-check query used by GET /api/health/db:
--   SELECT 1 AS ok;
--   SELECT extname FROM pg_extension WHERE extname = 'vector';
