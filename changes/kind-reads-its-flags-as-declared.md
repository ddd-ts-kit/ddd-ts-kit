**A kind of `generate` reads its flags as it declares them, as a command reads its options.** A
refactoring of the CLI, with no change of what `generate` writes, says or refuses: a kind gets its
flags as the `Arguments` of the options it declares, and a kind that reads a flag it does not
declare, itself or through a helper, no longer compiles. The kind a command line asks for, when a
flag stands before it (`generate --command CancelInvoice job billing Remind`), is found by one
rule: the kind that, its flags read as it declares them, is named first.
