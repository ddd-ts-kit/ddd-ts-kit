import { fileContentFindings } from '../files/file-content-findings';
import { schemaSources } from '../files/schema-sources';
import type { ProjectRule } from '../model/rule';
import { reporter } from '../support/reporter';
import { toViolations } from '../support/to-violations';

export const persistenceNoFileContent: ProjectRule = {
  id: 'persistence/no-file-content',
  description:
    'No column of file content in a persistence schema or a migration: no binary type (`bytea`, `blob`, `varbinary`, `.binary()`, Prisma `Bytes`) and no base64 column. Files live in the `FileStorage` port; a row keeps the `StoredFile` reference.',
  severity: 'error',
  doc: {
    why: 'A file in a column is read whole into the memory of the application and of the database, travels in every backup, every replica and every dump, swells the table its rows share pages with, and cannot be handed out by a short signed link: an upload of a few megabytes becomes a transaction, a replication lag and a backup to restore. An object store is made for it: it streams, it is cheap per gigabyte, it has lifecycle rules and signed links. The row keeps what the domain needs to know about the file, its reference.',
    bad: `export const invoices = pgTable('invoices', {
  receipt: bytea('receipt'),                 // the content of the file
  receiptBase64: text('receipt_base64'),     // the same, as text
});`,
    good: `export const invoices = pgTable('invoices', {
  receiptKey: text('receipt_key'),           // where the file storage keeps it
  receiptSize: integer('receipt_size'),
  receiptMediaType: text('receipt_media_type'),
  receiptChecksum: text('receipt_checksum'), // sha256 of the content
});`,
  },
  scope: 'project',
  judge(project) {
    const report = reporter(project, this.id);

    return schemaSources(project).flatMap(({ file, text }) => toViolations(report, file, fileContentFindings(text)));
  },
};
