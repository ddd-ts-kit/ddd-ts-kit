export const MODULE_FILE = 'src/contexts/billing/billing.module.ts';

/** The registration of a command as the generator writes it in the `handlers` region: one line. */
export function registered(name: string): string[] {
  return [
    `  platform.commands.register(${name}Command, new ${name}Handler(orderRepository, platform.clock), { context: 'billing' });`,
  ];
}

/** The same registration written on several lines, as a formatter leaves a long one: its handler and its options may differ. */
export function registeredOnLines(
  name: string,
  handler = `new ${name}Handler(orderRepository, platform.clock)`,
  options = "{ context: 'billing' }",
): string[] {
  return ['  platform.commands.register(', `    ${name}Command,`, `    ${handler},`, `    ${options},`, '  );'];
}

/** The module of billing wired by hand: the statements of its `handlers` region, in their order. */
export function moduleFile(...statements: readonly (readonly string[])[]): string {
  return [
    'export function registerBilling(platform: Platform): void {',
    '  // ddd-ts-kit:handlers',
    ...statements.flat(),
    '  // /ddd-ts-kit:handlers',
    '}',
    '',
  ].join('\n');
}

export const REPOSITORY = ['  const orderRepository = new DrizzleOrderRepository(platform.database);'];
