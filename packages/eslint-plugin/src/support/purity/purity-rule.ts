import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { LintedFile } from '../../project/linted-file';
import { ambientName } from '../globals/ambient-name';
import { propertyName } from '../globals/property-name';
import { importListener, type ImportListener } from '../imports/import-listener';
import { innerLayer } from '../imports/inner-layer';
import { defineRule, type Report } from '../rule/define-rule';
import { forbiddenCall } from './reference/forbidden-call';
import { forbiddenConstruction } from './reference/forbidden-construction';
import { forbiddenMember } from './reference/forbidden-member';
import { forbiddenNamedImport } from './reference/forbidden-named-import';
import type { PurityTable } from './reference/purity-table';

/** The three purity/* rules share one mechanism: forbidden globals and modules in domain/ and application/. */
export function purityRule(table: PurityTable) {
  return defineRule<'used' | 'imported'>({
    id: table.id,
    type: 'problem',
    recommended: 'error',
    description: table.description,
    messages: {
      used: `{{what}} is used in the {{layer}} layer. ${table.fix}`,
      imported: `"{{name}}" is imported in the {{layer}} layer. ${table.fix}`,
    },
    create({ file, sourceCode, report }) {
      const layer = innerLayer(file);

      if (layer === undefined) {
        return {};
      }

      const { used, imported } = reporters(layer, report);
      const ambient = (node: TSESTree.Node): string => ambientName(sourceCode, node) ?? '';
      const imports = moduleImports(table, file, imported);

      return {
        ...imports,
        ImportDeclaration: importDeclarationListener(table, imports, used),
        MemberExpression: (node) => used(node, forbiddenMember(table, ambient(node.object), propertyName(node))),
        'CallExpression:exit': (node: TSESTree.CallExpression) =>
          used(node, forbiddenCall(table, ambient(node.callee))),
        NewExpression: (node) =>
          used(node, forbiddenConstruction(table, ambient(node.callee), node.arguments.length > 0)),
        VariableDeclarator: destructuringListener(table, ambient, used),
      };
    },
  });
}

interface Reporters {
  /** A forbidden access, when `what` names one. */
  readonly used: (node: TSESTree.Node, what: string | undefined) => void;
  readonly imported: (node: TSESTree.Node, name: string) => void;
}

function reporters(layer: string, report: Report<'used' | 'imported'>): Reporters {
  return {
    used: (node, what) => {
      if (what !== undefined) {
        report({ node, messageId: 'used', data: { what, layer } });
      }
    },
    imported: (node, name) => report({ node, messageId: 'imported', data: { name, layer } }),
  };
}

/** The modules the rule forbids as a whole, however the file names them. */
function moduleImports(table: PurityTable, file: LintedFile, imported: Reporters['imported']): ImportListener {
  return importListener(file, ({ node, target }) => {
    if (target.kind !== 'file' && table.modules.includes(moduleName(target))) {
      imported(node, target.name);
    }
  });
}

/** The module as the import listener judges it, then each named import the rule forbids. */
function importDeclarationListener(
  table: PurityTable,
  imports: ImportListener,
  used: Reporters['used'],
): (node: TSESTree.ImportDeclaration) => void {
  return (node) => {
    imports.ImportDeclaration(node);

    for (const specifier of namedSpecifiersOf(node)) {
      used(specifier, forbiddenNamedImport(table, node.source.value, importedName(specifier)));
    }
  };
}

function moduleName(target: { readonly kind: 'package' | 'builtin'; readonly name: string }): string {
  return target.kind === 'builtin' ? (target.name.replace(/^node:/, '').split('/')[0] ?? '') : target.name;
}

function namedSpecifiersOf(node: TSESTree.ImportDeclaration): TSESTree.ImportSpecifier[] {
  return node.specifiers.filter((specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier);
}

function importedName(node: TSESTree.ImportSpecifier): string {
  return node.imported.type === AST_NODE_TYPES.Identifier ? node.imported.name : node.imported.value;
}

/** `const { env } = process` reads `process.env` as surely as the member expression does. */
function destructuringListener(
  table: PurityTable,
  ambient: (node: TSESTree.Node) => string,
  used: Reporters['used'],
): (node: TSESTree.VariableDeclarator) => void {
  return (node) => {
    const source = node.init === null ? '' : ambient(node.init);

    for (const [property, name] of destructured(node)) {
      used(property, forbiddenMember(table, source, name));
    }
  };
}

/** The properties a declarator takes out of its value by name, `env` of `const { env } = process`. */
function destructured(node: TSESTree.VariableDeclarator): [TSESTree.Property, string][] {
  if (node.id.type !== AST_NODE_TYPES.ObjectPattern) {
    return [];
  }

  return node.id.properties.flatMap((property): [TSESTree.Property, string][] => {
    if (property.type !== AST_NODE_TYPES.Property) {
      return [];
    }

    const name = keyName(property);

    return name === undefined ? [] : [[property, name]];
  });
}

function keyName(property: TSESTree.Property): string | undefined {
  if (property.key.type === AST_NODE_TYPES.Identifier && !property.computed) {
    return property.key.name;
  }

  return property.key.type === AST_NODE_TYPES.Literal && typeof property.key.value === 'string'
    ? property.key.value
    : undefined;
}
