**The HTTP pipeline writes the answer itself, and every adapter only sends it.** `executeRoute` of
`@ddd-ts-kit/http` now answers a `payload` already decided, `{ kind: 'none' }`, `{ kind: 'text', text }`,
`{ kind: 'bytes', bytes }` or `{ kind: 'stream', stream }`, that Express, Fastify, Hono, Nest and the oRPC and
tRPC procedures write as it is; `body` stays the value answered, for a spec. What it fixes:

- A route that answers a list read as it comes, mounted without `representations`, answered `200 {}`: it now
  answers the list as one JSON array, and a list nobody reads (an RPC call that refuses it, a `304`) is closed.
- A value JSON cannot write (a cycle) failed in the adapter, after the pipeline: `onError` was never told, and
  Express answered its 500 under the caching headers of the success. It is now an error of the route like any
  other, answered 500 as a problem under `no-store`. A big integer is written as its text in a plain answer, as
  it already was in a streamed list.
- Express kept a `close` and an `error` listener on the response at every pause of a slow client reading a
  streamed list (`MaxListenersExceededWarning`). The list goes through the pipeline of Node, as a file does.
- Express answered 400 `MALFORMED_BODY` for the valid JSON `null`, `12` or `"text"`, where Fastify and Hono answer
  422. `mountExpress` now reads the body of each route itself, up to `bodyLimit` (1 MiB by default, a new
  option), whatever JSON value it is; the generated servers set `strict: false` on the parser they keep, on
  Express and on Nest.
- `mountFastify` added the text parser of a media type a route consumes to the whole instance; it now adds it
  in the context of its routes only.
- `problemErrorHandler` (Express, Fastify, Hono) and `ProblemExceptionFilter` (Nest) answered 500 for an
  `UnauthorizedError`, a `ForbiddenError` or any `DomainError` a middleware raises in front of the routes. They
  now answer the problem a route answers for it, and take the `errorMapper` of the application as an option,
  which the generated servers give them.
- A code named after something every object inherits (`constructor`, `toString`) is no longer read as a status
  by the error mapper.
- `text/json` and `application/json-seq` are no longer taken for JSON by Hono, by the filter of Nest and by the
  RPC answer: JSON is `application/json` and every `+json` suffix, whatever the case and the parameters, as
  the representations already read it.
- Two class-validator DTO classes of one name (an `AddressDto` in two bounded contexts) each get the JSON
  Schema of their own fields in `@ddd-ts-kit/validation`: they were merged, and the contract required fields
  the server did not. One class that nests two classes of one name is refused with a `DeclarationError` when
  its schema is asked.

To move: an adapter of your own writes `response.payload` in place of `serializeBody(response)` and
`response.stream`, both removed; a spec that read the bytes of an answer (XML, CSV, a streamed list) through
them reads `await writtenText(response)` of `@ddd-ts-kit/http/testing`, and `response.body` is now the value
answered in every representation, absent for a list read as it comes.
To move: on Express, `app.use(express.json())` is no longer needed in front of `mountExpress`. If you keep it
(oRPC and tRPC read the body it parsed), give it `strict: false` so that `null`, a number or a text reach the
schema of the route, and on Nest over Express call `app.useBodyParser('json', { strict: false })` before the
application listens. Without a parser of yours, the limit of a body goes from 100 kB to 1 MiB: set `bodyLimit`
to keep the old one.
To move: give `problemErrorHandler({ logger, errorMapper })` and
`new ProblemExceptionFilter(adapter, { logger, errorMapper })` the error mapper your routes are mounted with, if
a middleware of yours raises errors of the domain whose code your mapper names.
To move: a class-validator DTO that nests two different classes of the same name: rename one of them. A
contract generated from two classes of one name changes: regenerate it (`npm run regenerate`).
