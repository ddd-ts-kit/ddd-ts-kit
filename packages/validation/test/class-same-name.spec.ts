import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
import { DeclarationError } from '@ddd-ts-kit/kernel/declarations';
import { classSchema } from '../src/class-validator';

/** Two bounded contexts, each with an address of its own under the name every context gives it. */
const BillingAddress = (() => {
  class AddressDto {
    @IsString()
    declare iban: string;
  }

  return AddressDto;
})();

const ShippingAddress = (() => {
  class AddressDto {
    @IsString()
    declare street: string;

    @IsString()
    declare city: string;
  }

  return AddressDto;
})();

class InvoiceDto {
  @ValidateNested()
  @Type(() => BillingAddress)
  declare address: InstanceType<typeof BillingAddress>;
}

class ParcelDto {
  @ValidateNested()
  @Type(() => ShippingAddress)
  declare address: InstanceType<typeof ShippingAddress>;
}

class MovedInvoiceDto {
  @ValidateNested()
  @Type(() => BillingAddress)
  declare billedAt: InstanceType<typeof BillingAddress>;

  @ValidateNested()
  @Type(() => ShippingAddress)
  declare sentTo: InstanceType<typeof ShippingAddress>;
}

describe('two classes of one name', () => {
  it('are each described by their own fields, as each is validated', () => {
    const billing = classSchema(BillingAddress);

    expect(billing.toJsonSchema()).toMatchObject({ properties: { iban: { type: 'string' } }, required: ['iban'] });
    expect(Object.keys(billing.toJsonSchema()['properties'] as object)).toEqual(['iban']);
    expect(billing.parse({ iban: 'FR76' }).ok).toBe(true);

    expect(classSchema(ShippingAddress).toJsonSchema()).toMatchObject({
      properties: { street: { type: 'string' }, city: { type: 'string' } },
      required: ['street', 'city'],
    });
  });

  it('are each the definition of the class that nests them', () => {
    expect(classSchema(InvoiceDto).toJsonSchema()).toMatchObject({
      properties: { address: { $ref: '#/$defs/AddressDto' } },
      $defs: { AddressDto: { required: ['iban'] } },
    });

    expect(classSchema(ParcelDto).toJsonSchema()).toMatchObject({
      $defs: { AddressDto: { required: ['street', 'city'] } },
    });
  });

  it('are refused, by their name, in one class that nests both: its contract has one schema per name', () => {
    const moved = classSchema(MovedInvoiceDto);

    expect(() => moved.toJsonSchema()).toThrow(DeclarationError);

    expect(() => moved.toJsonSchema()).toThrow(
      'MovedInvoiceDto reaches two classes named AddressDto, and a contract names a schema after its class: rename one of them.',
    );
  });
});

/** A tree of folders: a class that nests itself, and twice. */
class FolderDto {
  @IsString()
  declare name: string;

  @ValidateNested()
  @Type(() => FolderDto)
  declare parent: FolderDto;

  @ValidateNested({ each: true })
  @Type(() => FolderDto)
  declare children: FolderDto[];
}

class LabelledDto {
  @ValidateNested()
  @Type(() => String)
  declare label: string;

  /** A nested field whose class nothing tells: no `@Type`, and the compiler records `Object` for it. */
  @ValidateNested()
  declare untold: unknown;

  @IsString()
  @JSONSchema({ $ref: '#/$defs/WrittenByHand' })
  declare elsewhere: string;
}

describe('the classes a class reaches', () => {
  it('are each defined once, the class itself included when a field of its own points back at it', () => {
    const schema = classSchema(FolderDto).toJsonSchema();

    expect(Object.keys(schema['$defs'] ?? {})).toEqual(['FolderDto']);

    expect(schema).toMatchObject({
      properties: {
        parent: { $ref: '#/$defs/FolderDto' },
        children: { type: 'array', items: { $ref: '#/$defs/FolderDto' } },
      },
    });
  });

  it('are classes only: a scalar is its type, a field typed as nothing more is any object, a reference written by hand stays', () => {
    const schema = classSchema(LabelledDto).toJsonSchema();

    expect(schema['$defs']).toEqual({ Object: { type: 'object' } });

    expect(schema).toMatchObject({
      properties: {
        label: { type: 'string' },
        untold: { $ref: '#/$defs/Object' },
        elsewhere: { $ref: '#/$defs/WrittenByHand' },
      },
    });
  });
});
