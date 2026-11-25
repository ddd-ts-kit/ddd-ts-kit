import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
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
