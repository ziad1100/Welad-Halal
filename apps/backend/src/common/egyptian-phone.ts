import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/** Egyptian mobile numbers only: 010/011/012/015 + exactly 11 digits. */
export const EGYPTIAN_PHONE_RE = /^01[0125][0-9]{8}$/;

export function isEgyptianPhone(v: unknown): boolean {
  return typeof v === 'string' && EGYPTIAN_PHONE_RE.test(v.trim());
}

export function IsEgyptianPhone(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isEgyptianPhone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => value === undefined || value === null || value === '' || isEgyptianPhone(value),
        defaultMessage: (_args?: ValidationArguments) => 'رقم الهاتف يجب أن يكون رقماً مصرياً صحيحاً (010/011/012/015، 11 رقماً)',
      },
    });
  };
}
