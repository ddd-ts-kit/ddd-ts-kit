import { uploadContentDefects } from '../files/upload-content-defects';
import { uploadDeclarations } from '../files/upload-declarations';
import type { Finding } from '../model/finding';
import type { FileRule } from '../model/rule';
import type { SourceFile } from '../model/source-file';

const FIX =
  "Give each accepted media type a content rule. The kit has one for the formats it recognises by their first bytes (PDF, PNG, JPEG, GIF, WebP, zip and the office documents, gzip) and for text (`text/plain`, `text/csv`, `text/tab-separated-values`, `text/markdown`, `application/json`, `application/csv`). For another type the route states it in `contentRules` of the upload: `'text'` when the content is text under another name (`{ 'application/vnd.ms-excel': 'text' }` for the CSV a browser on Windows sends), `'unchecked'` when the route takes the bytes as they are (`{ 'application/octet-stream': 'unchecked' }`). A stated rule names a type the upload accepts and the kit has no rule for.";

export const filesUploadContentRule: FileRule = {
  id: 'files/upload-content-rule',
  description:
    'Every media type the `upload` of a route or a controller accepts has a content rule, of the kit (a signature, text) or stated in its `contentRules`: a type with none could receive no file, and `@ddd-ts-kit/http` refuses the route when it is declared.',
  severity: 'error',
  doc: {
    why: "An upload is checked twice: the media type the client declares must be one the route accepts, and the first bytes must prove that type, by the signature of its format or, for text, by holding no control character and being valid UTF-8 (or any single-byte text when the upload says `text: 'single-byte'`). A type the kit has no such rule for can never be proven: `application/vnd.ms-excel`, which a browser on Windows sends for a CSV, `application/octet-stream`, a video. A route that accepts it without saying how its content is judged answers 415 to every file of it, which looks like a client mistake and is a declaration that could never work. So the route states the rule in `contentRules`: `text`, the content is text under another name, or `unchecked`, the route takes the bytes as they are and says so in its contract. `@ddd-ts-kit/http` refuses the route when it is declared, with the same sentence; this rule reads the upload of a *.route.ts or a *.controller.ts when its `mediaTypes` and `contentRules` are written as literals, and reports the string. Reported too: an entry that is no media type (`*/*`, a bare word), a family none of whose types has a rule (`video/*`), and a stated rule that does nothing, for a type the kit already verifies or one the upload does not accept. The rule of a family never reaches a type a browser runs (`image/svg+xml`, `text/html`, `application/xhtml+xml`, `text/javascript`, `application/javascript`): accepted, such a type is reported until `contentRules` names it. A list built elsewhere (a constant, a spread) is not read here: the declaration of the route judges it.",
    bad: `@Controller({
  method: 'POST',
  path: '/statements',
  upload: { field: 'file', maxBytes: 5_000_000, mediaTypes: ['text/csv', 'application/vnd.ms-excel'] },
  response: { status: 201 },
})`,
    good: `@Controller({
  method: 'POST',
  path: '/statements',
  upload: {
    field: 'file',
    maxBytes: 5_000_000,
    mediaTypes: ['text/csv', 'application/vnd.ms-excel'],
    text: 'single-byte',
    contentRules: { 'application/vnd.ms-excel': 'text' },
  },
  response: { status: 201 },
})`,
  },
  scope: 'file',
  judge(file) {
    return isRouteFile(file) ? findingsOf(file) : [];
  },
};

function isRouteFile(file: SourceFile): boolean {
  return !file.isTest && /\.(?:route|controller)\.ts$/.test(file.path);
}

function findingsOf({ scan }: SourceFile): Finding[] {
  return uploadDeclarations(scan)
    .flatMap(uploadContentDefects)
    .map(({ literal, message }) => ({
      line: literal.line,
      message: `${message} The upload could receive no file of it, and the route is refused when it is declared.`,
      fix: FIX,
    }));
}
