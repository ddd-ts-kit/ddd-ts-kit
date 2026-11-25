// What a command of a line writes: its redirections, the files its program names by the tables
// `TOOL_WRITES`, `PATH_COMMANDS` and `ACCESS_COMMANDS`, an edit in place, what git changes in the work
// tree; and the free places anyone may write. Read by pre-bash, where the reader of the shell is loaded
// (`call.shell`); pre-write and subagent-stop reach it with no command to read.
import { existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { call } from './call.mjs';
import { filesIn, realOf, realPlace } from './disk.mjs';
import { findProject } from './project.mjs';
import { AWK_PROGRAMS, gitInvocation, INLINE_CODE } from './shell-reads.mjs';

// The names `find` may find a scope file by: the files and the kit's folder that holds them.
const SCOPE_NAMES = ['story.json', 'worker.json', '.ddd-ts-kit'];

export const FREE_OUTPUT = 'Output to /dev/null or to the system temp directory stays free.';

const OUTPUT_REDIRECTS = new Set(['>', '>>', '>|', '&>', '&>>', '<>', '>&']);
// Editors that rewrite the files they open in place.
export const IN_PLACE_EDITORS = new Set(['vim', 'vi', 'ex', 'ed']);
// Linters and test runners that write the paths they are given, behind a flag.
// For a writer of its operands, `subcommands` are the words that name an action, not a path, and
// `valued` the options whose value is no path it writes.
export const TOOL_WRITES = {
  eslint: {
    kind: 'operands',
    flags: ['--fix', '--fix-dry-run'],
    subcommands: [],
    valued: [
      '-c',
      '--config',
      '--ext',
      '--parser',
      '--parser-options',
      '--plugin',
      '--rule',
      '--rulesdir',
      '--env',
      '--global',
      '--ignore-path',
      '--ignore-pattern',
      '-f',
      '--format',
      '-o',
      '--output-file',
      '--max-warnings',
      '--cache-location',
      '--resolve-plugins-relative-to',
    ],
  },
  biome: {
    kind: 'operands',
    flags: ['--write', '--fix'],
    subcommands: ['format', 'check', 'lint', 'ci'],
    valued: [
      '--config-path',
      '--max-diagnostics',
      '--diagnostic-level',
      '--log-level',
      '--log-kind',
      '--reporter',
      '--stdin-file-path',
      '--vcs-root',
      '--files-max-size',
    ],
  },
  vitest: { kind: 'valued', valued: ['--outputFile', '--outputJson'] },
};
export const DOWNLOAD_FLAGS = {
  curl: ['-o', '--output'],
  wget: ['-O', '--output-document', '-P', '--directory-prefix'],
};
// git subcommands that rewrite tracked files the command does not name, by one of their flags.
const GIT_FORCE_WRITERS = {
  reset: ['--hard', '--merge', '--keep'],
  switch: ['-f', '--force', '--discard-changes'],
  checkout: ['-f', '--force'],
  'read-tree': ['-u'],
};

// The commands whose `-t` names the directory they write in; `touch -t` takes a date.
const TARGETED_COMMANDS = new Set(['cp', 'mv', 'ln', 'install']);

// The commands that change the paths they are given, with the options that take a value, and which
// operands they change: all of them, or the destination only.
export const PATH_COMMANDS = {
  cp: { valued: ['-S', '--suffix'], changes: 'destination' },
  ln: { valued: ['-S', '--suffix'], changes: 'destination' },
  install: { valued: ['-S', '--suffix', '-m', '--mode', '-o', '--owner', '-g', '--group'], changes: 'destination' },
  mv: { valued: ['-S', '--suffix'], changes: 'all' },
  rm: { valued: [], changes: 'all' },
  rmdir: { valued: [], changes: 'all' },
  unlink: { valued: [], changes: 'all' },
  shred: { valued: ['-n', '-s', '--iterations', '--size'], changes: 'all' },
  touch: { valued: ['-r', '-d', '-t', '--reference', '--date'], changes: 'all' },
  truncate: { valued: ['-s', '-r', '--size', '--reference'], changes: 'all' },
};

// The commands that change who may read or write a file, or whether it may change: the options that
// take a value, and whether the `first` operand is the mode or the owner.
// `given` are the options that give that first operand instead; `--restore` reads the files from a list.
const REFERENCE = /^--reference(?:=|$)/;
export const ACCESS_COMMANDS = {
  chmod: { valued: ['--reference'], first: true, given: REFERENCE },
  chown: { valued: ['--reference', '--from'], first: true, given: REFERENCE },
  chgrp: { valued: ['--reference'], first: true, given: REFERENCE },
  chflags: { valued: [], first: true, given: /^$/ },
  chcon: {
    valued: ['--reference', '-u', '-r', '-t', '-l', '--user', '--role', '--type', '--range'],
    first: true,
    given: /^(?:-[urtl]$|--(?:reference|user|role|type|range)(?:=|$))/,
  },
  chattr: { valued: ['-v', '-p'], first: false },
  setfattr: { valued: ['-n', '-v', '-x', '--name', '--value', '--remove', '--restore'], first: false },
  setfacl: {
    valued: ['-m', '-x', '-M', '-X', '--modify', '--remove', '--set', '--modify-file', '--remove-file', '--set-file'],
    first: false,
  },
};

// Whether a sed command writes a file or runs a command by its scripts: a script file, which cannot be read
// in advance, the commands `w`, `W` and `e`, the flags `w` and `e` of `s`. An address or a pattern is skipped.
export function sedWrites(args) {
  if (args.some((word) => /^(?:-[a-zA-Z]*f|--file)/.test(word))) {
    return true;
  }
  const scripts = [];
  for (let index = 0; index < args.length; index += 1) {
    if (/^-[a-zA-Z]*e$/.test(args[index]) || args[index] === '--expression') {
      scripts.push(args[index + 1] ?? '');
      index += 1;
    } else if (args[index].startsWith('--expression=')) {
      scripts.push(args[index].slice('--expression='.length));
    }
  }
  const [first = ''] = call.shell.operands(args, ['-l', '--line-length']);
  return (scripts.length > 0 ? scripts : [first]).some(sedScriptWrites);
}

// The commands of a sed script, each address and pattern skipped: whether one writes a file or runs a command.
function sedScriptWrites(script) {
  const scan = { script, at: 0 };
  while (scan.at < script.length) {
    const char = script[scan.at];
    scan.at += 1;
    if ('wWe'.includes(char) || (char === 's' && substitutionWrites(scan))) {
      return true;
    }
    skipOperand(scan, char);
  }
  return false;
}

// `s/pattern/text/flags`: the flags `w` and `e` write a file or run a command.
function substitutionWrites(scan) {
  skipDelimited(scan, 2);
  const [flags] = /^[^;}\n]*/.exec(scan.script.slice(scan.at));
  scan.at += flags.length;
  return /[we]/.test(flags);
}

// What no command lies in: the pattern of an address, the text of `a`, `i`, `c`, the label or file of the others.
function skipOperand(scan, char) {
  if (char === '/') {
    scan.at -= 1;
    skipDelimited(scan, 1);
  } else if (char === '\\' || char === 'y') {
    skipDelimited(scan, char === 'y' ? 2 : 1);
  } else if ('aic'.includes(char)) {
    skipTo(scan, '\n');
  } else if (':btTrRqQlLv'.includes(char)) {
    skipTo(scan, ';\n');
  }
}

// From the delimiter at the cursor, past the `count` parts it closes, escapes included.
function skipDelimited(scan, count) {
  const delimiter = scan.script[scan.at];
  scan.at += 1;
  for (let part = 0; part < count; part += 1) {
    while (scan.at < scan.script.length && scan.script[scan.at] !== delimiter) {
      scan.at += scan.script[scan.at] === '\\' ? 2 : 1;
    }
    scan.at += 1;
  }
}

function skipTo(scan, ends) {
  while (scan.at < scan.script.length && !ends.includes(scan.script[scan.at])) {
    scan.at += 1;
  }
}

// `-i`, `-ni`, `--in-place`: an edit of the files given in place.
export function inPlaceFlag(args) {
  return args.some((word) => (/^-[a-zA-Z]*i/.test(word) && !word.startsWith('--')) || word.startsWith('--in-place'));
}

// The first file under `folder`, at any depth, that has another name elsewhere; `top` itself once
// more files were read than `budget.left` allows.
export function multiplyNamed(folder, budget, top = folder) {
  for (const file of filesIn(folder)) {
    budget.left -= 1;
    if (budget.left < 0) {
      return top;
    }
    const stat = lstatSync(file, { throwIfNoEntry: false });
    const found = stat?.isDirectory()
      ? multiplyNamed(file, budget, top)
      : stat?.isFile() && stat.nlink > 1
        ? file
        : undefined;
    if (found) {
      return found;
    }
  }
  return undefined;
}

// The files a command writes by name, of a project or unknown to all but the shell.
export function writtenTargets(command) {
  const at = (target, by, lock) => ({ place: call.shell.placeOf(target, command.directory), by, lock });
  const redirected = command.redirects
    .filter(({ operator }) => OUTPUT_REDIRECTS.has(operator))
    .map(({ operator, target, wrapper, unread, lock }) => {
      const shown = target.replaceAll(call.shell.UNKNOWN, '$(...)');
      // A wrapper writes a file of its own as a redirection does; one given an option the guard
      // does not read may write anywhere.
      const written = unread
        ? `\`${wrapper}\`, given an option the guard does not read,`
        : `\`${wrapper}\` writing its output to ${shown}`;
      return at(target, wrapper ? written : `the redirection \`${operator} ${shown}\``, lock);
    });

  // A place of the temp directory that is a link elsewhere is the place it reaches; a device is itself.
  return [...redirected, ...inPlaceTargets(command).map((file) => at(file.word, file.by))]
    .map((target) =>
      target.place !== undefined && !target.place.startsWith('/dev/') && isFree(target)
        ? { ...target, place: realPlace(target.place) }
        : target,
    )
    .filter((target) => target.place === undefined || !isFree(target) || findProject(target.place) !== undefined);
}

// A lock `flock` takes is free in the runtime directory of the user too ($XDG_RUNTIME_DIR), where the
// checkouts of one machine share it: `flock` creates the file when missing and never writes in it.
function isFree({ place, lock }) {
  return isFreePlace(place) || (lock === true && isUnder(place, [process.env.XDG_RUNTIME_DIR]));
}

// The only absolute places a worker writes outside its scope: the null and standard devices and
// the system temporary directory (os.tmpdir() or $TMPDIR) outside every project. Everything else is judged.
export function isFreePlace(place) {
  if (['/dev/null', '/dev/stdout', '/dev/stderr'].includes(place)) {
    return true;
  }
  return isUnder(place, [tmpdir(), process.env.TMPDIR]);
}

function isUnder(place, directories) {
  return directories
    .filter((dir) => typeof dir === 'string' && dir !== '')
    .flatMap((dir) => [resolve(dir), realOf(resolve(dir))])
    .some((dir) => place === dir || place.startsWith(`${dir}/`));
}

// `sed -i`, `perl -i` and `tee` write the files they are given.
function inPlaceTargets({ words }) {
  const name = call.shell.commandName(words);
  const args = words.slice(1);
  if (name === 'tee') {
    return call.shell.operands(args).map((word) => ({ word, by: `\`tee\` writing ${word}` }));
  }
  // A sed script writes a file by `w file`, `W file` or an `s///w` flag, whose target the script hides.
  if (name === 'sed' && !inPlaceFlag(args) && sedWrites(args)) {
    return [{ word: call.shell.UNKNOWN, by: 'a sed script that writes a file' }];
  }
  const files = ['sed', 'perl', 'ruby'].includes(name) ? inPlaceFiles(args) : [];

  return files.map((word) => ({ word, by: `\`${name} -i\` editing ${word}` }));
}

// The files of an in-place edit: every operand once the script is given by `-e` or `-f`, else all but the first.
function inPlaceFiles(args) {
  if (!inPlaceFlag(args)) {
    return [];
  }
  const files = [];
  let scripted = false;
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    const valued = /^-[a-zA-Z]*[efE]$/.test(word) || ['--expression', '--file'].includes(word);
    scripted ||= valued || /^(-[a-zA-Z]*[efE]|--expression=|--file=)/.test(word);
    if (valued || word === '-l' || word === '--line-length') {
      index += 1;
    } else if (!word.startsWith('-')) {
      files.push(word);
    }
  }

  return scripted ? files : files.slice(1);
}

export function runsInlineCode({ words, heredoc, piped, redirects }) {
  const name = call.shell.commandName(words);
  const language = name.replace(/[\d.]+$/, '');
  const args = words.slice(1);
  if (!(language in INLINE_CODE)) {
    return false;
  }
  const flag = args.some((word) => INLINE_CODE[language].test(word));
  const script = args.find((word) => !word.startsWith('-') || word === '-');
  const fed = heredoc || piped || redirects.some(({ operator }) => operator === '<' || operator === '<<<');

  return flag || script === '-' || (script === undefined && fed && !args.includes('-m'));
}

// The paths a command changes, each with what changes it.
export function changedPaths(command) {
  const name = call.shell.commandName(command.words);
  return tableWrites(name, command) ?? programWrites(name, command.words, command.directory) ?? [];
}

// cp, mv, rm, dd, find -delete, patch and git: the writers whose targets the tables already read.
function tableWrites(name, { words, directory, expression }) {
  const at = (word, by) => ({ place: call.shell.placeOf(word, directory), by });
  if (name in PATH_COMMANDS) {
    const recursive = name === 'rm' && words.some((word) => /^(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)$/.test(word));
    return pathOperands(name, words.slice(1)).map((word) => ({
      ...at(word, name),
      below: recursive || (word.endsWith('/{}') && findReachesScope(expression)),
    }));
  }
  if (name in ACCESS_COMMANDS) {
    const below = words.some((word) => /^(?:-[a-zA-Z]*R[a-zA-Z]*|--recursive)$/.test(word));
    return accessOperands(name, words.slice(1)).map((word) => ({ ...at(word, name), below }));
  }
  if (name === 'dd') {
    return words.filter((word) => word.startsWith('of=')).map((word) => at(word.slice(3), 'dd'));
  }
  if (name === 'find' && words.includes('-delete')) {
    const roots = words.slice(1, call.shell.firstExpression(words));
    const below = findReachesScope(words.slice(call.shell.firstExpression(words)));
    return (roots.length > 0 ? roots : ['.']).map((root) => ({ ...at(`${root}/{}`, 'find -delete'), below }));
  }
  if (name === 'patch' && !words.includes('--dry-run')) {
    return [{ place: undefined, by: 'patch' }];
  }
  return name === 'git' ? gitChangedPaths(words.slice(1), directory) : undefined;
}

// Whether what `find` finds can be a scope file or its folder: the names its `-name` and `-iname`
// tests ask, when the expression is their plain conjunction; any other expression can find them.
function findReachesScope(expression = []) {
  if (expression.some((word) => ['-o', '-or', '!', '-not', '(', ','].includes(word))) {
    return true;
  }
  const patterns = expression.flatMap((word, index) =>
    ['-name', '-iname'].includes(word) ? expression.slice(index + 1, index + 2) : [],
  );
  return patterns.every((pattern) => SCOPE_NAMES.some((name) => namedBy(pattern, name)));
}

// A name a pattern of `find` matches, ignoring case; a bracket expression may match any.
function namedBy(pattern, name) {
  const glob = pattern
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replaceAll('*', '.*')
    .replaceAll('?', '.');
  return pattern.includes('[') || new RegExp(`^${glob}$`, 'i').test(name);
}

// The writers the cp and mv tables miss: an editor that rewrites in place, a downloader, an archive
// tool, an awk program, a linter or runner given a path, or find writing a listing to a file.
function programWrites(name, words, directory) {
  const at = (word, by) => ({ place: call.shell.placeOf(word, directory), by });
  const args = words.slice(1);
  if (IN_PLACE_EDITORS.has(name)) {
    return call.shell.operands(args).map((word) => at(word, name));
  }
  if (name === 'rsync') {
    const operands = call.shell.operands(args, RSYNC_VALUED);
    return operands.length > 1 ? [at(operands.at(-1), 'rsync')] : [];
  }
  if (name === 'curl' || name === 'wget') {
    return downloadWrites(name, args, at);
  }
  if (name === 'tar' || name === 'unzip') {
    return archiveWrites(name, args, at);
  }
  if (AWK_PROGRAMS.has(name)) {
    return awkWrites(args) ? [{ place: undefined, by: 'an awk program that writes a file' }] : [];
  }
  if (name === 'find') {
    return findListings(words, at);
  }
  return name in TOOL_WRITES ? toolWrites(name, args, at) : undefined;
}

export const RSYNC_VALUED = [
  '-e',
  '--rsh',
  '--exclude',
  '--include',
  '--files-from',
  '-f',
  '--filter',
  '--compare-dest',
];

// curl writes `-o file`/`--output file` and the basename of the URL with `-O`; wget writes `-O file`
// and under the directory of `-P`/`--directory-prefix`.
function downloadWrites(name, args, at) {
  const flags = DOWNLOAD_FLAGS[name];
  const writes = [];
  for (let index = 0; index < args.length; index += 1) {
    if (flags.includes(args[index])) {
      writes.push(at(args[index + 1] ?? call.shell.UNKNOWN, name));
    }
  }
  if (name === 'curl' && args.some((word) => /^-[A-Za-z]*O[A-Za-z]*$/.test(word) && !word.startsWith('--'))) {
    writes.push({ place: undefined, by: 'curl -O' });
  }
  return writes;
}

// An extraction writes places only the shell resolves (the current directory, a -C or -d target);
// tar creating an archive writes the file of `-f`/`--file`. unzip extracts unless it lists or tests.
function archiveWrites(name, args, at) {
  if (name === 'unzip') {
    return args.some((word) => word === '-l' || word === '-t') ? [] : [{ place: undefined, by: name }];
  }
  const letters = tarLetters(args);
  if (letters.includes('x') || args.includes('--extract') || args.includes('--get')) {
    return [{ place: undefined, by: name }];
  }
  const file = letters.includes('c') || args.includes('--create') ? tarFile(args) : undefined;
  return file === undefined ? [] : [at(file, name)];
}

// The mode and option letters of tar: its first word in the old form (`tar czf ...`), else its short
// options (`-czf`, `-c -f`); never the name of an archive.
function tarLetters(args) {
  if (/^[A-Za-z]+$/.test(args[0] ?? '')) {
    return args[0];
  }
  return args
    .filter((word) => /^-[A-Za-z]+$/.test(word))
    .map((word) => word.slice(1))
    .join('');
}

// The archive tar names: the value of `--file`, or the word after the letters that hold `f`.
function tarFile(args) {
  const long = args.find((word) => word.startsWith('--file='));
  if (long !== undefined) {
    return long.slice('--file='.length);
  }
  const at = args.findIndex(
    (word, index) =>
      word === '--file' || (/^-?[A-Za-z]*f[A-Za-z]*$/.test(word) && (index === 0 || word.startsWith('-'))),
  );
  return at === -1 ? undefined : (args[at + 1] ?? call.shell.UNKNOWN);
}

// An awk program writes when it edits in place (`-i inplace`), redirects, pipes, or calls `system`.
function awkWrites(args) {
  const inPlace = args.some((word) => /^-i(nplace)?$/.test(word)) && args.includes('inplace');
  return inPlace || args.some((word) => /[>|]|\bsystem\b/.test(word));
}

// `find ... -fprint file`, `-fprintf file ...`, `-fls file`: the file after the action is written.
function findListings(words, at) {
  const writes = [];
  words.forEach((word, index) => {
    if (['-fprint', '-fprintf', '-fls'].includes(word)) {
      writes.push(at(words[index + 1] ?? call.shell.UNKNOWN, `find ${word.slice(1)}`));
    }
  });
  return writes;
}

function toolWrites(name, args, at) {
  const spec = TOOL_WRITES[name];
  const targets =
    spec.kind === 'valued'
      ? valuedTargets(args, spec.valued)
      : spec.flags.some((flag) => args.includes(flag))
        ? call.shell.operands(args, spec.valued).filter((word) => !spec.subcommands.includes(word))
        : [];
  return targets.map((word) => at(word, name));
}

// The values of `--outputFile file` and `--outputFile=file`, whatever the flag the runner takes.
function valuedTargets(args, valued) {
  const targets = [];
  for (let index = 0; index < args.length; index += 1) {
    const joined = valued.find((flag) => args[index].startsWith(`${flag}=`));
    if (valued.includes(args[index])) {
      targets.push(args[index + 1] ?? call.shell.UNKNOWN);
    } else if (joined) {
      targets.push(args[index].slice(joined.length + 1));
    }
  }
  return targets;
}

// The files a command that changes who may read or write them is given: after the mode or the owner,
// its first operand unless `--reference` gives it, and apart from the attributes of `chattr`. A mode
// spelled as an option (`-w`) is none of the operands.
function accessOperands(name, args) {
  const { valued, first, given } = ACCESS_COMMANDS[name];
  if (args.some((word) => /^--restore(?:=|$)/.test(word))) {
    return [call.shell.UNKNOWN];
  }
  const operands = call.shell.operands(args, valued).filter((word) => name !== 'chattr' || !/^[+=]/.test(word));
  const spelled = name === 'chmod' && args.some((word) => /^-[rwxXstugo]+$/.test(word));
  return first && !spelled && !args.some((word) => given.test(word)) ? operands.slice(1) : operands;
}

function pathOperands(name, args) {
  const { valued, changes } = PATH_COMMANDS[name];
  const directory = targetDirectory(name, args);
  const words = call.shell.operands(args, directory === undefined ? valued : [...valued, '-t', '--target-directory']);
  if (changes === 'all' || (name === 'install' && args.includes('-d'))) {
    return directory === undefined ? words : [...words, directory];
  }

  return directory === undefined ? words.slice(-1) : [directory];
}

// The directory of `-t dir`, `-tdir`, `--target-directory dir` or `--target-directory=dir`; a
// spaced form with nothing after it is a place only the shell knows.
export function targetDirectory(name, args) {
  if (!TARGETED_COMMANDS.has(name)) {
    return undefined;
  }
  const spaced = args.findIndex((word) => word === '-t' || word === '--target-directory');
  if (spaced !== -1) {
    return args[spaced + 1] ?? call.shell.UNKNOWN;
  }
  const joined = args.find((word) => /^(?:-t.|--target-directory=)/.test(word));
  return joined?.replace(/^(?:-t|--target-directory=)/, '');
}

// `git checkout -- <path>`, `git restore`, `git rm`, `git mv` and `git clean` rewrite or delete
// files of the work tree; `git apply` writes the files of a patch.
function gitChangedPaths(args, directory) {
  const { subcommand, tail, moved } = gitInvocation(args, directory);
  const at = (word) => ({ place: call.shell.placeOf(word, moved), by: `git ${subcommand}` });
  const forced = forcedGitWrite(subcommand, tail, at);
  if (forced) {
    return forced;
  }
  if (subcommand === 'checkout') {
    return checkedOutPaths(tail, moved).map(at);
  }
  if (subcommand === 'restore') {
    const staged = tail.some((word) => word === '--staged' || word === '-S');
    const worktree = tail.some((word) => word === '--worktree' || word === '-W');
    return staged && !worktree ? [] : call.shell.operands(tail, ['-s', '--source']).map(at);
  }
  if (subcommand === 'rm' || subcommand === 'mv') {
    return call.shell.operands(tail).map(at);
  }
  // The mode of a file in the index, or an entry of the index given whole, is a change of that file.
  if (subcommand === 'update-index' && tail.some((word) => /^--(?:cacheinfo|index-info|stdin)/.test(word))) {
    return [{ place: undefined, by: 'git update-index' }];
  }
  if (['add', 'update-index'].includes(subcommand) && tail.some((word) => word.startsWith('--chmod'))) {
    return call.shell.operands(tail).map(at);
  }
  if (subcommand === 'clean' && !tail.some((word) => /^(-[a-zA-Z]*n|--dry-run)$/.test(word))) {
    const named = call.shell.operands(tail, ['-e', '--exclude']);
    // `-x` and `-X` remove ignored files, `-d` enters the folders git does not track.
    const below = tail.some((word) => /^-[a-zA-Z]*[xX]/.test(word)) || untrackedBy(tail, /^-[a-zA-Z]*d/);
    return (named.length > 0 ? named : ['.']).map((word) => ({ ...at(word), below }));
  }
  const checking = tail.some((word) => /^--(check|stat|numstat|summary|cached)$/.test(word));

  return subcommand === 'apply' && !checking ? [{ place: undefined, by: 'git apply' }] : [];
}

// git writers that rewrite the work tree a worker does not name: a forced checkout, switch, reset
// or read-tree; a stash or checkout-index; a new worktree; a commit of every tracked change; a
// patch or report written out; or paths read from a file.
function forcedGitWrite(subcommand, tail, at) {
  if ((GIT_FORCE_WRITERS[subcommand] ?? []).some((flag) => tail.includes(flag))) {
    return [at('.')];
  }
  if (tail.some((word) => word.startsWith('--pathspec-from-file'))) {
    return [{ place: undefined, by: `git ${subcommand}` }];
  }
  if (touchesWorktree(subcommand, tail)) {
    // `--all` stashes the ignored files too, `--include-untracked` those git does not ignore.
    const below =
      tail.some((word) => /^(?:-[a-zA-Z]*a[a-zA-Z]*|--all)$/.test(word)) ||
      untrackedBy(tail, /^(?:-[a-zA-Z]*u[a-zA-Z]*|--include-untracked)$/);
    return [{ ...at('.'), below }];
  }
  if (subcommand === 'worktree' && tail[0] === 'add') {
    return [at(call.shell.operands(tail.slice(1), ['-b', '-B']).at(-1) ?? '.')];
  }
  if (subcommand === 'commit' && tail.some((word) => /^-[^-]*a/.test(word) || word === '--all')) {
    return [at('.')];
  }
  const out = gitOutputFile(subcommand, tail);
  return out === undefined ? undefined : [at(out)];
}

// 'untracked' when a word gives the option: the files git does not ignore are taken.
function untrackedBy(tail, option) {
  return tail.some((word) => option.test(word)) ? 'untracked' : false;
}

// stash writes the work tree unless it only reads it (list, show), and checkout-index with -a or -f.
function touchesWorktree(subcommand, tail) {
  if (subcommand === 'checkout-index') {
    return tail.some((word) => /^-[a-zA-Z]*[af]/.test(word) || word === '--all');
  }
  const action = tail.find((word) => !word.startsWith('-')) ?? '';
  return subcommand === 'stash' && !['list', 'show', 'drop', 'clear', 'branch'].includes(action);
}

// The file `git diff`, `log` or `show --output` and `git format-patch -o` write to, given spaced or joined.
function gitOutputFile(subcommand, tail) {
  if (['diff', 'log', 'show'].includes(subcommand)) {
    return valuedTargets(tail, ['--output', '-o'])[0];
  }
  return subcommand === 'format-patch' ? valuedTargets(tail, ['-o', '--output-directory'])[0] : undefined;
}

// After `--`, every word is a path; without it, the words that name an existing file or directory are.
function checkedOutPaths(tail, directory) {
  const dashes = tail.indexOf('--');
  if (dashes !== -1) {
    return tail.slice(dashes + 1);
  }

  return call.shell.operands(tail, ['-b', '-B', '--orphan']).filter((word) => {
    const place = call.shell.placeOf(word, directory);
    return place === undefined || existsSync(place);
  });
}
