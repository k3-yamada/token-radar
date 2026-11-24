/**
 * Reads `--name value` or `--name=value` from an argument list. A flag followed by another flag (`--input --output x`)
 * or by nothing has no value: the equals form is consulted next, then the default.
 */
export function option(argv: readonly string[], name: string, defaultValue: string): string {
  const flag = `--${name}`;
  const position = argv.indexOf(flag);
  if (position !== -1 && position + 1 < argv.length && !argv[position + 1]!.startsWith('--')) return argv[position + 1]!;
  const equalsForm = argv.find(value => value.startsWith(`${flag}=`));
  return equalsForm === undefined ? defaultValue : equalsForm.slice(flag.length + 1);
}
