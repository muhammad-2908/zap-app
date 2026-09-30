import { extractVariables, renderWithValues } from './template';

describe('template helpers', () => {
  it('extracts unique variables', () => {
    expect(extractVariables('{{pr.author}} {{ pr.number }} {{pr.author}}')).toEqual([
      'pr.author',
      'pr.number',
    ]);
  });

  it('renders with sample values and blanks unknown keys', () => {
    expect(renderWithValues('Hi {{pr.author}}{{x}}!', { 'pr.author': 'octocat' })).toBe(
      'Hi octocat!',
    );
  });
});
