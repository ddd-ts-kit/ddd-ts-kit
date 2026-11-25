import type { Finding } from '../model/finding';
import type { ResolvedImport } from '../model/resolved-import';
import type { Rule } from '../model/rule';
import { inLayer } from '../support/in-layer';
import { perFile } from '../support/per-file';

/** The connectors of the kernel: a model or a use case that names one has chosen where files live. */
const CONNECTORS = ['InMemoryFileStorage', 'LocalFileStorage', 'SelfSignedFileStorage'];

export const filesPortNotConnector: Rule = {
  id: 'files/port-not-connector',
  description:
    'domain/ and application/ name the `FileStorage` port of the kernel, never one of its connectors (`InMemoryFileStorage`, `LocalFileStorage`): where files live is chosen by the platform.',
  severity: 'error',
  doc: {
    why: 'Where files live is a choice of the platform: a directory in development, the memory in the tests, a bucket in a deployment. A handler or an aggregate that names a connector has made that choice for every environment, and its tests no longer run on the memory connector. The port says what is needed, streams in and out, signed links, and the platform binds the connector of each environment.',
    bad: `import { LocalFileStorage } from '@ddd-ts-kit/kernel';

export class AttachReceiptHandler {
  private readonly files = new LocalFileStorage({ directory: 'files' });
}`,
    good: `import type { FileKeys, FileStaging } from '@ddd-ts-kit/kernel';

export class AttachReceiptHandler {
  constructor(private readonly staging: FileStaging, private readonly keys: FileKeys) {}
}`,
  },
  scope: 'file',
  run(project) {
    return perFile(project, this.id, (file) => {
      const here = inLayer(file, 'domain') ?? inLayer(file, 'application');

      return here === undefined ? [] : file.imports.flatMap((imported) => connectorsOf(imported, here.layer));
    });
  },
};

function connectorsOf({ target, names, line }: ResolvedImport, layer: string): Finding[] {
  if (target.kind !== 'package' || target.name !== '@ddd-ts-kit/kernel') {
    return [];
  }

  return names
    .filter((name) => CONNECTORS.includes(name))
    .map((name) => ({
      line,
      message: `${layer}/ imports the file storage connector ${name}: it chooses where files live, which is the decision of the platform.`,
      fix: 'Depend on `FileStorage`, or on `FileStaging` and `FileKeys`, of @ddd-ts-kit/kernel; the platform binds the connector (`init --storage`), the in-memory one in the tests.',
    }));
}
