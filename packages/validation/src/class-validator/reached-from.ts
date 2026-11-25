import { getMetadataStorage, ValidationTypes } from 'class-validator';
import { DeclarationError } from '@ddd-ts-kit/kernel/declarations';
import type { DtoClass } from './dto-class';
import { prototypeOf } from './prototype-of';
import { typeMetadataOf } from './type-metadata-of';

type ReachedClass = DtoClass<object>;

/** What a field is typed as without being a class of the project. */
const SCALARS: readonly unknown[] = [String, Number, Boolean, Symbol];

/**
 * The class and every class its nested fields reach, by name: what a JSON Schema refers to. Each
 * is found through the type its field declares, never looked up by its name, and two classes of
 * one name reached from the same class are refused: its schema could name only one.
 */
export function reachedFrom(root: ReachedClass): Map<string, ReachedClass> {
  const reached = new Map<string, ReachedClass>([[root.name, root]]);

  const visit = (owner: ReachedClass): void => {
    for (const nested of nestedIn(owner)) {
      const known = reached.get(nested.name);

      if (known === undefined) {
        reached.set(nested.name, nested);
        visit(nested);
      } else if (known !== nested) {
        throw new DeclarationError(
          `${root.name} reaches two classes named ${nested.name}, and a contract names a schema after its class: rename one of them.`,
        );
      }
    }
  };

  visit(root);

  return reached;
}

/** The classes of the nested fields of a class, its inherited ones included. */
function nestedIn(owner: ReachedClass): ReachedClass[] {
  return getMetadataStorage()
    .getTargetValidationMetadatas(owner, '', true, false)
    .filter(({ type }) => type === ValidationTypes.NESTED_VALIDATION)
    .map(({ propertyName }) => typeOf(owner, propertyName))
    .filter(isClass);
}

/** The type class-transformer is told for the field (`@Type`), else the one the compiler recorded. */
function typeOf(owner: ReachedClass, property: string): unknown {
  const told = typeMetadataOf(owner, property);
  const recorded: unknown = Reflect.getMetadata('design:type', prototypeOf(owner), property);

  return told === undefined ? recorded : told.typeFunction();
}

function isClass(type: unknown): type is ReachedClass {
  return typeof type === 'function' && !SCALARS.includes(type);
}
