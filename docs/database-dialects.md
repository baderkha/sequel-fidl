# Database dialects

Connections and playgrounds persist `mysql` or `postgres`. Existing records with no engine retain the MySQL default. PostgreSQL connections default to database `postgres`; playgrounds use `main_db`.

The client previously assumed MySQL in several places. These are the extension points now used by both engines:

| Area | Contract and implementation |
| --- | --- |
| Connection defaults and quoting | `src/shared/db/dialects.ts` defines engine names, ports, defaults, identifier quoting and null comparisons. |
| Connections | `ConnectionFactory` chooses Sequelize's dialect and driver options. Saved connection records retain the engine. |
| Metadata and row operations | `AdminSQLCommand`, `MYSQLAdminCommand` and `PostgresAdminCommand` own catalog queries, schema metadata, filtered reads and writes. `SQLService.TableMetadata` replaces renderer `SHOW` and `information_schema` queries. |
| Renderer SQL | `DialectContext` supplies the current connection's engine. `sqlFor` and row action helpers generate quoted names, literals and predicates for previews and copied SQL. PostgreSQL keyless writes identify one matching physical row with `tableoid` and `ctid`. |
| Schema editor | The wizard uses the MySQL model adapter or `CreateTable/postgres.ts`. PostgreSQL uses identity columns, separate index/comment statements and atomic schema application. MySQL engine/collation queries and unsigned/on-update controls remain specific to MySQL. |
| Transactions | MySQL keeps its implicit-commit warning. PostgreSQL editor statements, inserts, updates, deletes and schema edits use savepoints when an app transaction is open. Metadata and exports can read that transaction's uncommitted changes. |
| SQL editor | Monaco language, formatter, suggestions, quoted identifiers and statement splitting follow the engine. PostgreSQL dollar-quoted routines, nested comments and JSON operators are supported. |
| Seed data and document editing | Generators understand PostgreSQL booleans, UUIDs, arrays and JSONB. Document edits preserve SQL arrays and distinguish JSON arrays from SQL arrays. |
| Playground lifecycle | `IDBProcess` / `BaseDockerDB` share lifecycle operations; `MYSQLDocker` and `PostgresDocker` supply image, credentials, persistent paths and import commands. Samples declare their engine. |
| Terminals | Profiles resolve the live database target; PostgreSQL launches `psql`, MySQL launches `mysql`. |
| Exports | `RowSource` stays independent of the database. `MySQLSource` streams mysql2 rows; `PostgresSource` uses a server cursor with PostgreSQL type descriptors and exact text parsing. Batch snapshots use the engine's transaction syntax. |

PostgreSQL tables outside `public` appear as `schema.table`. Metadata includes columns, generated/identity flags, indexes, composite foreign keys, comments, constraints and reconstructed DDL. Catalog DDL is useful for inspection; use PostgreSQL's `pg_dump` when a complete database backup is needed. Generated columns and expression/partial indexes are preserved by the visual editor and remain locked where its controls cannot represent them.

Parquet uses fixed decimal schemas for declared PostgreSQL numeric precision/scale. Unbounded `numeric` exports as exact text by default because no fixed scale can preserve every possible value; the export preview shows this choice.

## Starter dataset

Choose PostgreSQL → Bookshop in the playground creation form. The five tables and `order_totals` view are bundled in `src/main/service/postgresSample.ts` and imported together in a transaction on the first open. Stopping and reopening keeps the imported data. MySQL's World and Sakila archive imports retain their existing behavior.

## Verification

The PostgreSQL integration test requires an existing disposable server and creates a uniquely named schema, which it removes afterward:

```sh
SEQUEL_POSTGRES_TEST_URL=postgres://postgres:password@127.0.0.1:5432/postgres npm run test:postgres
```

It checks the starter import, schema metadata, filtered reads, inserts and conflicts, updates/deletes, duplicate rows without keys, scalar JSON keys, savepoint recovery after failed writes/reads/exports, uncommitted export visibility, typed streaming, cursor cleanup, a Parquet write/read of exact numeric values, visual schema SQL and cloning with independent sequences.

The UI regressions can run without a server:

```sh
npm test -- --runInBand --runTestsByPath src/__tests__/Postgres.test.tsx src/__tests__/CellEditing.test.tsx src/__tests__/DocumentView.test.tsx --modulePaths '<rootDir>/src'
```
