/** A name the reader can end, and nothing of a longer one after it. */
const NAME = String.raw`([\w$]+)(?=[\s(<{=:;,]|$)`;

/** A constant the module exports, up to the sign that gives it its value. */
const EXPORTED = new RegExp(String.raw`^export\s+(?:const|let|var)\s+${NAME}\s*(?::[^=;]*)?=(?!>)`);

/** A list of names exported without a module: the names it takes from the module itself. */
const LISTED = /^export\s+(?:type\s+)?\{([^{}]*)\}(?!\s*from)/;

/** A value that is a binding, or a member of one, and nothing else: its binding. */
const BINDING_VALUE =
  /^\s*(?!(?:true|false|null|undefined|this)(?![\w$]))([A-Za-z_$][\w$]*)(?:\s*\??\.\s*[\w$]+|\s*\[[^\]]*\])*\s*$/;

/** A literal of one token, a string the scan blanked keeping its quotes. */
const LITERAL = /^(?:'[^']*'|"[^"]*"|`[^`]*`|-?\d[\w.]*|true|false|null)$/;

/** A function written in place: what it returns is built when it is called. */
const FUNCTION = /^(?:async\s+)?(?:function(?![\w$])|\([^()]*\)\s*(?::[^=]*)?=>|[A-Za-z_$][\w$]*\s*=>)/;

/** The callee of a call or of a `new`, its type arguments, a few deep, then its opening parenthesis. */
const CALLEE =
  /^(?:new\s+)?[A-Za-z_$][\w$]*(?:\s*\??\.\s*[\w$]+)*\s*(?:<(?:[^<>()]|<(?:[^<>()]|<[^<>()]*>)*>)*>)?\s*\(/;

/** A member a call may go on with. */
const MEMBER = /^\??\.\s*[\w$]+/;

/** How many aliases of aliases are followed before a value is called another binding's. */
const ALIASES = 4;

/**
 * Whether the `export` that starts the code here exports a value the module does not build
 * itself: a constant, `export const` or one an export list names, whose value is not its own.
 * It is its own when it is a literal, an object, an array or a function written in place, or a
 * call or a `new` whose arguments are not one binding alone, unless that binding is a constant of
 * the module given a literal (`pgSchema(MESSAGING_SCHEMA)`). A binding or a member of one is its own
 * only when the module declares that binding, does not export it, and builds it itself, as the
 * event store of the template (`eventStore.head`). Anything else is an alias, a re-export in
 * disguise the reader cannot equate with what it names: a cast, parentheses, a `!`, a condition.
 */
export function exportsAnAlias(code: string, rest: string): boolean {
  const exported = EXPORTED.exec(rest);

  if (exported !== null) {
    return !isOwnValue(code, initialiserAt(rest, exported[0].length), 0);
  }

  const listed = LISTED.exec(rest)?.[1] ?? '';

  return listed
    .split(',')
    .map((part) => /^\s*(?:type\s+)?([A-Za-z_$][\w$]*)/.exec(part)?.[1])
    .some((name) => {
      const declared = name === undefined ? undefined : declarationOf(code, name);

      return declared?.value !== undefined && !isOwnValue(code, declared.value, 0);
    });
}

/** Whether a value is one the module builds itself. */
function isOwnValue(code: string, value: string, depth: number): boolean {
  const written = value.trim();

  if (LITERAL.test(written) || FUNCTION.test(written) || isOneGroup(written)) {
    return true;
  }

  const args = argumentsOf(written);

  if (args !== undefined) {
    // One argument alone, whatever the lines it is written on and a comma after it.
    const alone = BINDING_VALUE.exec(args.replace(/,\s*$/, ''))?.[1];

    return alone === undefined || isLiteralConstant(code, alone);
  }

  const base = BINDING_VALUE.exec(written)?.[1];

  return base !== undefined && depth < ALIASES && isOwnBinding(code, base, depth + 1);
}

/** Whether the module declares a binding, does not export it, and builds it itself. */
function isOwnBinding(code: string, name: string, depth: number): boolean {
  const declared = declarationOf(code, name);

  return (
    declared !== undefined &&
    !isExported(code, name) &&
    (declared.value === undefined || isOwnValue(code, declared.value, depth))
  );
}

function isLiteralConstant(code: string, name: string): boolean {
  const value = declarationOf(code, name)?.value;

  return value !== undefined && LITERAL.test(value.trim());
}

/** The declaration of a binding at the top level of the module: the value of a constant, none for a function, a class or an enum. */
function declarationOf(code: string, name: string): { value?: string } | undefined {
  const escaped = name.replace(/\$/g, String.raw`\$`);

  const declared = new RegExp(
    String.raw`(?<![\w$.])(?:(const|let|var)\s+${escaped}\s*(?::[^=;]*)?=(?!>)|(?:function\s*\*?|class|enum)\s+${escaped}(?![\w$]))`,
    'g',
  );

  const found = [...code.matchAll(declared)].find(({ index }) => isTopLevel(code, index));

  if (found === undefined) {
    return undefined;
  }

  return found[1] === undefined ? {} : { value: initialiserAt(code, found.index + found[0].length) };
}

function isExported(code: string, name: string): boolean {
  const escaped = name.replace(/\$/g, String.raw`\$`);

  const declared = new RegExp(
    String.raw`(?<![\w$.])export\s+(?:const|let|var|function\s*\*?|class|enum)\s+${escaped}(?![\w$])`,
  );

  const listed = new RegExp(
    String.raw`(?<![\w$.])export\s+(?:type\s+)?\{[^{}]*(?<![\w$])${escaped}(?![\w$])[^{}]*\}(?!\s*from)`,
  );

  return declared.test(code) || listed.test(code);
}

/** The arguments of a call or a `new` that is the whole value, which may go on with members and calls; undefined for any other value. */
function argumentsOf(value: string): string | undefined {
  const callee = CALLEE.exec(value);
  const close = callee === null ? -1 : closingOf(value, callee[0].length - 1);

  return callee !== null && close >= 0 && endsCalled(value.slice(close + 1))
    ? value.slice(callee[0].length, close)
    : undefined;
}

/** Whether what follows a call is members and calls only, the last a call: the value is still built by a call. */
function endsCalled(after: string): boolean {
  let rest = after.trim();

  while (rest !== '') {
    const member = MEMBER.exec(rest);
    const close = member === null && rest.startsWith('(') ? closingOf(rest, 0) : -1;

    if (member === null && close < 0) {
      return false;
    }

    rest = (member === null ? rest.slice(close + 1) : rest.slice(member[0].length)).trim();

    if (member !== null && rest === '') {
      return false;
    }
  }

  return true;
}

/** Whether a value is one object or one array written in place, and nothing after it. */
function isOneGroup(value: string): boolean {
  return /^[{[]/.test(value) && closingOf(value, 0) === value.length - 1;
}

/** Where the bracket opened at `open` closes, or -1. */
function closingOf(text: string, open: number): number {
  let depth = 0;

  for (let at = open; at < text.length; at += 1) {
    depth += '([{'.includes(text.charAt(at)) ? 1 : ')]}'.includes(text.charAt(at)) ? -1 : 0;

    if (depth === 0) {
      return at;
    }
  }

  return -1;
}

/** The value given from here: up to the `;` or the `,` that ends it at its level, a new statement, or the end. */
function initialiserAt(code: string, from: number): string {
  let depth = 0;

  for (let at = from; at < code.length; at += 1) {
    const char = code.charAt(at);

    depth += '([{'.includes(char) ? 1 : ')]}'.includes(char) ? -1 : 0;

    // A comma at the level of the statement declares a second name, which the reader does not answer for anyway.
    if (depth <= 0 && (char === ';' || char === ',' || isStatementAfter(code, at))) {
      return code.slice(from, at);
    }
  }

  return code.slice(from);
}

/** Whether a line ends here and the next one starts another statement. */
function isStatementAfter(code: string, at: number): boolean {
  return (
    code.charAt(at) === '\n' &&
    /^\s*(?:export|import|const|let|var|function|class|interface|type|enum)(?![\w$])/.test(code.slice(at))
  );
}

/** Whether this place of the code is in no block: a declaration in a function is no declaration of the module. */
function isTopLevel(code: string, at: number): boolean {
  let depth = 0;

  for (const char of code.slice(0, at)) {
    depth += char === '{' ? 1 : char === '}' ? -1 : 0;
  }

  return depth === 0;
}
