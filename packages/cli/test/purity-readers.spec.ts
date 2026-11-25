import { describe, expect, it } from 'vitest';
import { ambientMentions } from '../src/check/purity/ambient-mentions';
import { isMemberDeclaration } from '../src/check/purity/is-member-declaration';
import { keysTakenFrom } from '../src/check/purity/keys-taken-from';
import { localScopes } from '../src/check/purity/local-scopes';
import { memberAfter } from '../src/check/purity/member-after';
import { bodyAfter } from '../src/check/purity/text/body-after';
import { holderOf } from '../src/check/purity/text/holder-of';
import { scan } from '../src/check/scan/scan';

/** The text of each scope a source binds the name in. */
function scoped(code: string, name: string): string[] {
  return localScopes(code, name).map(({ start, end }) => code.slice(start, end));
}

/** The text of each mention of the names that means the global. */
function mentioned(code: string, ...names: string[]): string[] {
  return ambientMentions(code, names).map(({ start, end }) => code.slice(start, end));
}

function declares(code: string, name: string): boolean {
  const start = code.indexOf(name);

  return isMemberDeclaration(code, { start, end: start + name.length }, code.indexOf('(', start));
}

describe('the scopes in which a source binds a name itself', () => {
  it.each([
    [
      'a constant, in the whole source when no block holds it',
      'const process = 1;\nprocess;',
      ['const process = 1;\nprocess;'],
    ],
    ['a variable, in the block that declares it', 'if (a) { let process = 1; } process;', ['{ let process = 1; }']],
    [
      'a function and a class, in the block that declares them',
      '{ function Date() {} } { class Date {} }',
      ['{ function Date() {} }', '{ class Date {} }'],
    ],
    [
      'the variable of a loop, in its head and its body',
      'for (const process of all) { process; } process;',
      ['(const process of all) { process; }'],
    ],
    [
      'the variable of a loop without braces, in its head',
      'for (const process of all) use(process);',
      ['(const process of all)'],
    ],
    [
      'a parameter, in its signature and its body',
      'function f(a: A, console: L): { x: 1 } { console; } console;',
      ['(a: A, console: L): { x: 1 } { console; }'],
    ],
    [
      'a parameter property',
      'class A { constructor(private readonly console: L) { console; } }',
      ['(private readonly console: L) { console; }'],
    ],
    [
      'an optional parameter and one with a default',
      'function f(fetch?: F, process = 1) { }',
      ['(fetch?: F, process = 1) { }'],
    ],
    [
      'the parameter of an arrow, up to what ends its answer',
      'run((console) => console.log, 2);',
      ['(console) => console.log'],
    ],
    [
      'the parameter of an arrow with a return type',
      'const f = (process: P): Promise<{ a: 1 }> => process.env;',
      ['(process: P): Promise<{ a: 1 }> => process.env'],
    ],
    ['the lone parameter of an arrow', 'run(Date => Date.now(), 2);', ['Date => Date.now()']],
    ['the lone parameter of an arrow with a block', 'run(Date => { Date.now(); });', ['Date => { Date.now(); }']],
    ['the parameter of a catch', 'try { } catch (process) { process; }', ['(process) { process; }']],
    [
      'a destructured constant',
      'function f() { const { a, b: console = 1 } = deps; }',
      ['{ const { a, b: console = 1 } = deps; }'],
    ],
    [
      'a destructured parameter, nested',
      'function f({ a: [fetch] }: D) { fetch(); }',
      ['({ a: [fetch] }: D) { fetch(); }'],
    ],
    [
      'a method whose return type is a function type, as far as the arrow of that type answers',
      'class A { m(self: S): () => void { self; } }',
      ['(self: S): () => void { self; } '],
    ],
  ])('%s', (_what, code, expected) => {
    const [name = ''] = /console|process|fetch|Date|self/.exec(expected[0] ?? '') ?? [];

    expect(scoped(code, name)).toEqual(expected);
  });

  it.each([
    ['an argument of a call', 'run(console, process);'],
    ['a condition', 'if (console) { console; } while (console) { } switch (console) { }'],
    ['a key of a pattern, which binds the name after it', 'const { console: log } = deps;'],
    ['a key and a value of an object', 'const o = { console: console, a: console };\nrun({ console });'],
    ['an element of an array', 'const list = [console];'],
    [
      'the type of a parameter, of a property and of a constant',
      'function f(a: console, b: { c: console }) { const d: { e: console } = b; }',
    ],
    ['the default of a parameter', 'function f(a = console) { }'],
    ['a value compared in a call before a block', 'if (same(a, console == b)) { }'],
    [
      'the argument of a call in a ternary or a case',
      'x = a ? run(console) : { b: 1 };\nswitch (a) { case run(console): { break; } }',
    ],
    ['a member', 'this.console = deps.console;'],
  ])('reads no scope from %s', (_what, code) => {
    expect(scoped(code, 'console')).toEqual([]);
  });
});

describe('the mentions of a global in a source', () => {
  it('are its name, alone or taken from the global object, with the parentheses that group it', () => {
    const code = 'Date.now(); globalThis.Date.now(); window?.Date; new (Date)(); return (Date); [...Date];';

    expect(mentioned(code, 'Date')).toEqual(['Date', 'globalThis.Date', 'window?.Date', '(Date)', '(Date)', 'Date']);
  });

  it('are not the member of another object, nor the argument a call is given', () => {
    expect(mentioned('this.Date; a.b.Date; a?.Date; clock\n  .Date; a.globalThis.Date; run(Date);', 'Date')).toEqual([
      'Date',
    ]);
  });

  it('are not the names the source binds, the global object included', () => {
    const code = 'function f(Date: D, self: S) { Date.now(); self.Date.now(); }\nself.Date.now();';

    expect(mentioned(code, 'Date')).toEqual(['self.Date']);
  });
});

describe('a method declared under the name of a global', () => {
  it.each([
    ['with a body', 'class A { fetch(id) { } }'],
    ['with a body after a return type', 'class A { fetch(id): Promise<{ a: 1 }> { } }'],
    ['with a modifier and no return type', 'abstract class A { abstract fetch(id: string); }'],
    ['with a return type, first in a body', 'interface A { fetch(id: string): string }'],
    ['with a return type, after another member', 'interface A { a: 1; fetch(id: string): string; }'],
    ['with a return type, after a method', 'class A { a() { } fetch(id: string): string; }'],
    ['with a return type, in an object', 'const a = { b, fetch(id: string): string { } };'],
    ['with a return type, first in the source', 'fetch(id: string): string;'],
  ])('is read %s', (_what, code) => {
    expect(declares(code, 'fetch')).toBe(true);
  });

  it.each([
    ['a statement', 'run(); fetch(url);'],
    ['the first statement of a block', 'function f() { fetch(url); }'],
    ['an awaited call', 'const a = await fetch(url);'],
    ['a branch of a ternary', 'const a = b ? fetch(url) : c;'],
    ['the value of a case', 'switch (a) { case fetch(url): break; }'],
    ['a value of an object', 'const a = { b: fetch(url), c };'],
  ])('is not read from a call: %s', (_what, code) => {
    expect(declares(code, 'fetch')).toBe(false);
  });
});

describe('what the purity readers read around an offset', () => {
  it('the member after a name, dotted, optional or quoted, and nothing else', () => {
    const after = (code: string): string | undefined => memberAfter(scan(code), code.indexOf('Date') + 'Date'.length);

    expect(['Date.now', 'Date ?. now', "Date['now']", 'Date?.["now"]'].map(after)).toEqual([
      'now',
      'now',
      'now',
      'now',
    ]);

    expect(['Date[now]', "Date['now' + a]", 'Date`now`', 'Date(now)', 'Date'].map(after)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('the keys a declaration takes from a value, and none from an assignment or a value that is not destructured', () => {
    const taken = (code: string): string[] =>
      keysTakenFrom(scan(code), code.indexOf('process')).map(({ name }) => name);

    expect(taken("const { env, argv: args, 'exit': quit, [key]: other, ...rest } = process;")).toEqual([
      'env',
      'argv',
      'exit',
    ]);

    expect(taken('({ env } = process);')).toEqual([]);
    expect(taken('const all = process;')).toEqual([]);
    expect(taken('const { env } == process;')).toEqual([]);
  });

  it('the brackets that hold it, and none at the top of the source', () => {
    const code = 'a(b, [c], { d });';

    expect(holderOf(code, code.indexOf('d'))).toEqual({ start: code.indexOf('{'), end: code.indexOf('}') + 1 });
    expect(holderOf(code, code.indexOf('{'))).toEqual({ start: 1, end: code.indexOf(';') });
    expect(holderOf(code, 0)).toBeUndefined();
  });

  it('the end of the body a parenthesis introduces, and none after the arguments of a call', () => {
    const end = (code: string): string | undefined => {
      const found = bodyAfter(code, code.indexOf(')') + 1);

      return found === undefined ? undefined : code.slice(code.indexOf(')') + 1, found);
    };

    expect(end('f(a) { b; } c;')).toBe(' { b; }');
    expect(end('f(a): { x: 1 } | B<{ y: 2 }> { b; } c;')).toBe(': { x: 1 } | B<{ y: 2 }> { b; }');
    expect(end('(a) => b + (c, d), e')).toBe(' => b + (c, d)');
    expect(end('(a) => { b; }, e')).toBe(' => { b; }');
    expect(end('(a) => b')).toBe(' => b');
    expect(end('f(a); { b; }')).toBeUndefined();
    expect(end('f(a) + { b }')).toBeUndefined();
    expect(end('f(a): string;')).toBeUndefined();
    expect(end('x ? f(a) : b = 1')).toBeUndefined();
    expect(end('f(a): string')).toBeUndefined();
    expect(end('f(a)')).toBeUndefined();
  });
});
