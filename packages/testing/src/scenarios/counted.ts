/** `1 event`, `2 events`: a count with its noun, as a failure message writes it. */
export function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
