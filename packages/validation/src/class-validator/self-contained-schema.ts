import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js';
import { targetConstructorToSchema } from 'class-validator-jsonschema';
import type { JsonSchema } from '../json-schema';
import { DEFINITIONS_POINTER } from '../shared/definitions-pointer';
import type { DtoClass } from './dto-class';
import { reachedFrom } from './reached-from';

type SchemasByName = Record<string, JsonSchema>;

const DESCRIBING = { classTransformerMetadataStorage: defaultMetadataStorage, refPointerPrefix: DEFINITIONS_POINTER };

/**
 * The JSON Schema of a class, carrying under `$defs` only the classes reachable from it. A class
 * that extends another one holds the properties of its ancestors too, as validation does: a class
 * that declares nothing itself (`class Body extends pickClass(...) {}`) is described by them.
 * Shared, the class itself is one of them and the schema is a reference to it. Every class is
 * described from its own constraints, as it is validated: another class of the same name, in
 * another bounded context, never lends it a field.
 */
export function selfContainedSchema(dto: DtoClass<object>, shared: boolean): JsonSchema {
  const own = describedAlone(dto);
  const all = { ...describedByName(dto), [dto.name]: own };
  const defs: SchemasByName = shared ? { [dto.name]: own } : {};

  collectDefs(own, all, defs);

  const names = Object.keys(defs).sort();

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...(shared ? { $ref: `${DEFINITIONS_POINTER}${dto.name}` } : own),
    ...(names.length > 0 ? { $defs: Object.fromEntries(names.map((name) => [name, defs[name]])) } : {}),
  };
}

/** The schema of the class and of every class it reaches, under the name a reference gives each. */
function describedByName(dto: DtoClass<object>): SchemasByName {
  const reached = reachedFrom(dto);

  return Object.fromEntries([...reached].map(([name, reachedClass]) => [name, describedAlone(reachedClass)]));
}

/**
 * The schema of one class, from the constraints of its lineage and of nothing else: the properties
 * of each class of the lineage, the farthest ancestor first, and every required name.
 */
function describedAlone(described: DtoClass<object>): JsonSchema {
  return inherited(
    lineageOf(described)
      .map((ancestor): JsonSchema => ({ ...targetConstructorToSchema(ancestor, DESCRIBING) }))
      .filter((schema) => Object.keys(schema).length > 0),
  );
}

/** The class and its ancestors, the farthest first. */
function lineageOf(described: DtoClass<object>): DtoClass<object>[] {
  const lineage: DtoClass<object>[] = [];

  for (let current: unknown = described; isNamedClass(current); current = Object.getPrototypeOf(current)) {
    lineage.unshift(current);
  }

  return lineage;
}

function isNamedClass(value: unknown): value is DtoClass<object> {
  return typeof value === 'function' && value.name !== '';
}

/** The schemas of a lineage as one: the properties of each, the nearest class last, and every required name. */
function inherited(schemas: readonly JsonSchema[]): JsonSchema {
  if (schemas.length === 0) {
    return { type: 'object' };
  }

  const merged: JsonSchema = {};
  const properties: JsonSchema = {};
  const required = new Set<unknown>();

  for (const schema of schemas) {
    Object.assign(merged, schema);
    Object.assign(properties, schema['properties']);
    (Array.isArray(schema['required']) ? schema['required'] : []).forEach((name: unknown) => required.add(name));
  }

  return { ...merged, properties, ...(required.size === 0 ? {} : { required: [...required] }) };
}

function collectDefs(node: unknown, all: SchemasByName, defs: SchemasByName): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectDefs(item, all, defs);
    }

    return;
  }

  if (typeof node !== 'object' || node === null) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const name = referencedDefinition(key, value);

    if (name === undefined) {
      collectDefs(value, all, defs);
    } else {
      collectDefinition(name, all, defs);
    }
  }
}

function referencedDefinition(key: string, value: unknown): string | undefined {
  if (key === '$ref' && typeof value === 'string' && value.startsWith(DEFINITIONS_POINTER)) {
    return value.slice(DEFINITIONS_POINTER.length);
  }

  return undefined;
}

function collectDefinition(name: string, all: SchemasByName, defs: SchemasByName): void {
  const target = all[name];

  // The root is carried too when a nested class points back at it.
  if (target !== undefined && defs[name] === undefined) {
    defs[name] = target;
    collectDefs(target, all, defs);
  }
}
