# Database Migrations

Use this folder for safe, incremental SQL changes to an existing database.

Do not put destructive reset scripts here. Avoid `DROP TABLE` unless you have a
separate backup and an explicit rollback plan.

`backend/db/schema.sql` is a local reset script only.
