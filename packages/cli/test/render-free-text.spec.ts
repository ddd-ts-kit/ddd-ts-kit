import { describe, expect, it } from 'vitest';
import { cli, read } from './helpers';
import { render } from '../src/templating';
import { initProject } from './support/init-project';

describe('a value a template is given', () => {
  it('is written as it is, braces included: only the text of the template is read for placeholders', () => {
    expect(render('# {{title}}\n', { title: 'Render pages with {{mustache}} tags' })).toBe(
      '# Render pages with {{mustache}} tags\n',
    );

    expect(render('{{#if on}}{{purpose}}{{/if}}', { on: true, purpose: 'Ships {{parcels}} and {{#if}}' })).toBe(
      'Ships {{parcels}} and {{#if}}',
    );
  });

  it('never hides a tag the template itself leaves unread', () => {
    expect(() => render('{{ first name }}', {})).toThrow('template: leftover placeholder "{{ first name }}"');
    expect(() => render('{{#each rows}}', {})).toThrow('leftover placeholder "{{#each rows}}"');
    expect(render('{{#if on}}{{ first name }}{{/if}}${{ secrets.TOKEN }}', { on: false })).toBe('${{ secrets.TOKEN }}');
  });

  it('lets a decision record be titled with braces', () => {
    const root = initProject('--context', 'billing:core');

    expect(cli(root, 'generate', 'adr', 'Render pages with {{mustache}} tags').code).toBe(0);
    expect(read(root, 'docs/adr/0001-render-pages-with-mustache-tags.md')).toContain('{{mustache}}');
  });
});
