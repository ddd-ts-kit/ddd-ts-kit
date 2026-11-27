import { isOneOf, RELATIONSHIPS, type Upstream } from '../../config';
import { CliError } from '../../cli-error';
import { parseContextName } from '../../naming';
import type { Kind } from '../kind';
import { parseTerms } from '../parse-terms';
import { applyPreset } from '../../presets/apply-preset';
import { presetNamed } from '../../presets/preset-named';
import { generateContext } from './generate-context';

export const contextKind: Kind = {
  name: 'context',
  aliases: [],
  summary:
    'A bounded context: CONTEXT.md with its glossary, published language, config entry, and what assembles it (its declarations, or its module file); with --preset, written whole from a preset of the kit.',
  scope: 'new-context',
  positionals: ['name'],
  options: {
    classification: { type: 'string', value: '<core|supporting|generic>' },
    reason: { type: 'string', value: '"<why it is of that classification>"' },
    purpose: { type: 'string', value: '"<two sentences>"' },
    term: { type: 'string', multiple: true, value: '"<Term>=<meaning>[|<not to be confused with>]"' },
    upstream: { type: 'string', multiple: true, value: '<ctx>[:relationship]' },
    preset: { type: 'string', value: 'identity' },
  },
  shownOptions:
    '--classification <core|supporting|generic> [--reason "<why it is of that classification>"] [--purpose "<two sentences>"] [--term "<Term>=<meaning>[|<not to be confused with>]"]... [--upstream <ctx>[:relationship]]... [--preset identity]',
  shared: {
    files: [
      'ddd-ts-kit.config.json',
      'the composition root (<platformDir>/composition/compose-application.ts)',
      'test/architecture/extractable.spec.ts',
      'the permissions registry (<platformDir>/auth/authorization/permissions.ts)',
      'the CONTEXT.md of each upstream',
      'docs/context-map.md',
      '.dependency-cruiser.cjs',
      'knip.json (the first context)',
    ],
  },
  writesInModules: false,
  run: ({ ws, config, args, flags, probe }) => {
    const name = args[0] ?? '';
    const preset = flags.preset === undefined ? undefined : presetNamed(flags.preset);

    const declared = generateContext(ws, config, {
      name,
      classification: flags.classification ?? preset?.classification,
      upstreams: flags.upstream.map(parseUpstreamFlag),
      purpose: flags.purpose ?? preset?.purpose,
      classificationReason: flags.reason ?? preset?.classificationReason,
      terms: parseTerms(flags.term),
      builtOn: probe?.builtOn,
    });

    if (preset !== undefined) {
      applyPreset(ws, declared, { context: name, preset });
    }
  },
};

function parseUpstreamFlag(value: string): Upstream {
  const [context = '', relationship = 'published-language'] = value.split(':');

  if (!isOneOf(RELATIONSHIPS, relationship)) {
    throw new CliError(
      `Unknown relationship "${relationship}" in --upstream ${value}.`,
      `Use one of: ${RELATIONSHIPS.join(', ')}.`,
    );
  }

  return { context: parseContextName(context).kebab, relationship };
}
