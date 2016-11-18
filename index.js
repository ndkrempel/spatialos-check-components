#!/usr/bin/env node --throw-deprecation --use_strict

// TODO: Setup linting, preprocessing, compiling/minifying, testing.
// TODO: Add missing fields to "package.json".
// TODO: Use Winston/Bunyan for logging.
// TODO: ANSI color with custom string literal.
//     (See chalk, colors, cli-color, ansi, ansicolors, terminal-kit, manakin.)
//     Configuration by command-line options, default auto-detect.
//     Forked logging with different settings, including color setting?
// TODO: Support SpatialOS 9 "spatialos.*.worker.json" files.

'use strict';

const assert  = require('assert'),
    util = require('util'),
    promisify = require('promisify-node'),  // TODO: Unused?
    path = require('path'),
    fs = promisify('fs'),
    program = require('commander');

require('./helpers');
const schema = require('./schema');

const PROJECT_FILE = 'spatialos.json',
    SCHEMA_DIR = 'schema',
    SCHEMA_EXT = '.schema',
    WORKERS_DIR = 'workers',
    WORKER_FILE = 'spatialos_worker.json',
    GENERATED_DIRS = ['generated', 'Generated'],
    GSIM_WORKER = 'gsim';

const Language = {
  SCALA: 'Scala',
  CSHARP: 'C#',
  CPP: 'C++',
};

const LANGUAGE_DATA = {
  [Language.SCALA]: {
    extensions: ['.scala'],
    apiTypes: ['', 'Descriptor', 'Writer', 'Updater', 'Update', 'Watcher'],
    checker: checkForReferencesScala,
  },
  [Language.CSHARP]: {
    extensions: ['.cs'],
    apiTypes: ['', '_Extensions', 'Writer', 'Reader'],
    checker: checkForReferencesCSharp,
  },
  [Language.CPP]: {
    extensions: ['.cc', '.h'],
    apiTypes: [''],
    checker: checkForReferencesCpp,
  },
};

program.version('0.0.0')
  .description('Tool for checking component usage in a SpatialOS project.')
  .arguments('[project_path]')
  .parse(process.argv);

if (program.args.length > 1) {
  program.outputHelp();
  process.exit(1);
}

const projectPath = (() => {
  if (!program.args.empty) {
    let path = program.args[0];
    if (!directoryExists(path))
      errorExit('Fatal error: specified path "%s" does not exist or is not a directory.', path);
    if (!isSpatialOSProject(path))
      errorExit('Fatal error: specified path "%s" is not a SpatialOS project directory'
          + ' (missing "%s" file).', path, PROJECT_FILE);
    return path;
  } else {
    let path = findSpatialOSProject();
    if (path == null)
      errorExit('Fatal error: could not find SpatialOS project.\n'
          + 'Run this tool from within a SpatialOS project directory tree'
          + ' (indicated by the presence of a "%s" file),'
          + ' or specify the path to the project root as an argument.', PROJECT_FILE);
  }
})();
log('Using SpatialOS project at "%s".', projectPath);

const project = JSON.parse(fs.readFileSync(path.join(projectPath, PROJECT_FILE), 'utf8'));
assert(project.hasOwnProperty('name') && typeof project['name'] === 'string', 'Missing project name');
assert(project.hasOwnProperty('project_version') && typeof project['project_version'] === 'string', 'Missing project version');
assert(project.hasOwnProperty('sdk_version') && typeof project['sdk_version'] === 'string', 'Missing project SDK version');
const projectName = project['name'],
  projectVersion = project['project_version'],
  projectSdkVersion = parseVersion(project['sdk_version']);
assert(projectSdkVersion, 'Invalid project SDK version');
log('Name:           %s', projectName);
log('Version:        %s', projectVersion);
log('SDK version:    %s', stringifyVersion(projectSdkVersion));
// TODO: Support earlier SpatialOS versions.
if (projectSdkVersion[0] < 8)
  errorExit('Fatal error: this tool only supports projects using'
      + ' the new schema format (SpatialOS 8 or later).\n'
      + 'The project\'s declared SDK version is %s.', stringifyVersion(projectSdkVersion));

// spatialos_worker.json
//  build_type: scala | unity
//  build_assets: [gsim, scala_exe]
//  generate_build_scripts: boolean
//  launch
//    <configuration>
//      <os> (windows | mac)
//        command:
//        arguments: []
//          ${IMPROBABLE_PROJECT_NAME}
//          ${IMPROBABLE_PROJECT_ROOT}
// ...
log('Workers:');
const workers = [], workersPath = path.join(projectPath, WORKERS_DIR);
for (const workerName of fs.readdirSync(workersPath)) {
  const workerPath = path.join(workersPath, workerName);
  if (!fs.statSync(workerPath).isDirectory())
    continue;
  let data;
  try {
    data = fs.readFileSync(path.join(workerPath, WORKER_FILE), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT')
      continue;
    throw e;
  }
  const workerData = JSON.parse(data);
  const worker = {
    name: workerName,
    languages: [],
  };
  switch (workerData.build_type) {
    case 'scala':
      worker.languages.push(Language.SCALA);
      break;
    case 'unity':
      worker.languages.push(Language.CSHARP);
      break;
    case 'unreal':
      worker.languages.push(Language.CPP);
      break;
    // TODO: C#, C++, (C, Java, JavaScript, ...?)
    case undefined:
      errorExit('Missing worker type for "%s".', workerName);
    default:
      errorExit('Unknown worker type for "%s": "%s".', workerName, workerData.build_type);
  }
  log('  %s (%s: %s)', workerName, workerData.build_type, worker.languages.join(', '));
  workers.push(worker);
  // TODO
}
if (workers.empty)
  errorExit('No workers found. Ensure "%s" is present inside each worker directory.', WORKER_FILE);
if (!workers.some(_ => _.name === GSIM_WORKER))
  errorExit('GSim worker not found. Ensure a worker directory named "%s" is present and contains a "%s" file.', GSIM_WORKER, WORKER_FILE);

const schemaPath = path.join(projectPath, SCHEMA_DIR);
assert(directoryExists(schemaPath), 'Schema directory not present');
log('Scanning schema definitions...');
let components = [];
for (const [file, breadcrumbs] of readDirRecursive(schemaPath)) {
  if (!breadcrumbs.last.endsWith(SCHEMA_EXT))
    continue;
  // log('==> %s', breadcrumbs.join('/'));
  // TODO: Is UTF-8 the right encoding?
  const data = fs.readFileSync(file, 'utf8')
  // TODO: Use schema.FileStream to avoid reading entire file into a string.
  const s = schema.parse(new schema.StringStream(data));
  /*
  for (const component of s.components)
    log('  (%d) %s', component.id, s.package.concat(component.name).join('.'));
  */
  for (const component of s.components)
    component.package = s.package;
  components = components.concat(s.components);
}
log('%d components found.', components.length);

components.sort((x, y) => x.id - y.id);
/*
log('All components:');
for (const component of components)
  log('%d\t%s', component.id, component.name);
log('ID ranges: %s.', groupRanges(components.map(_ => _.id)).map(r => r[0] + (r[0] !== r[1] ? '-' + r[1] : '')).join(', '));
*/

const types = {};
for (const language of Object.values(Language)) {
  const apiTypes = LANGUAGE_DATA[language].apiTypes;
  const list = [], revMap = [];
  components.forEach((c, i) => apiTypes.forEach(t => {
    list.push(c.package.concat(c.name + t));
    revMap.push(i);
  }));
  types[language] = {list, revMap};
}

log('Scanning worker code (this could take several minutes)...');
for (const component of components)
  component.workers = new Set;
console.log();  // TODO: Remove.
for (const worker of workers) {
  // log('  %s', worker.name);
  console.log('\b\r%s', ' '.repeat(79));  // TODO: Remove.
  console.log('\b\r  %s', worker.name);
  console.log();  // TODO: Remove.
  const workerPath = path.join(workersPath, worker.name),
      dirFilter = (_, breadcrumbs) => !GENERATED_DIRS.includes(breadcrumbs.last);
  for (const [file, breadcrumbs] of readDirRecursive(workerPath, dirFilter)) {
    for (const language of worker.languages) {
      if (!LANGUAGE_DATA[language].extensions.some(_ => breadcrumbs.last.endsWith(_)))
        continue;
      console.log('\b\r%s', ' '.repeat(79));  // TODO: Remove.
      console.log('\b\r%s', file.slice(-79));  // TODO: Remove.
      const data = fs.readFileSync(file, 'utf8')
      const indices = LANGUAGE_DATA[language].checker(data, types[language].list);
      for (const i of indices)
        components[types[language].revMap[i]].workers.add(worker.name);
    }
  }
}
console.log('\b\r%s', ' '.repeat(79));  // TODO: Remove.
console.log('\b\rDone.');  // TODO: Remove.
// log('Done.')

const COL_WIDTH = 32;
log('');
log('%s | %s | %s', (' '.repeat(6) + 'ID').slice(-6), (' '.repeat(COL_WIDTH) + 'Component').slice(-COL_WIDTH), 'Workers');
log('%s-+-%s-+-%s', '-'.repeat(6), '-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH));
for (const component of components) {
  const abbrevName = component.package.map(_ => _[0]).concat(component.name).join('.')
  log('%s | %s | %s',
      (' '.repeat(6) + component.id).slice(-6),
      (' '.repeat(COL_WIDTH) + abbrevName).slice(-COL_WIDTH),
      Array.from(component.workers).join(', ').substring(0, COL_WIDTH));
}

log('');
for (const component of components) {
  const fullName = component.package.concat(component.name).join('.');
  if (!component.workers.size) {
    log('Component "%s" not used by any worker.', fullName);
    continue;
  }
  if (!component.workers.has(GSIM_WORKER)) {
    log('Component "%s" not used by GSim.', fullName);
    continue;
  }
  const sync = !component.options.some(_ => _.name === 'synchronized' && _.value === false);
  if (!sync && component.workers.size !== 1) {
    log('Component "%s" used by non-GSim workers but not synchronized.', fullName);
    continue;
  }
  if (sync && component.workers.size === 1) {
    log('Component "%s" is GSim-only but still synchronized.', fullName);
    continue;
  }
}

function checkForReferencesScala(text, types) {
  // Temp hack:
  let match, package_ = [];
  const packageRegExp = /(?:^|;)\s*package\s+([^;\n]+)(?:$|;)/gm;
  if (match = packageRegExp.exec(text))
    package_ = match[1].split('.').map(_ => _.trim());
  const imports = [], importRegExp = /(?:^|;|\{)\s*import\s+([^;\n]+)(?:$|;)/gm;
  for (let i = 1; i <= package_.length; ++i)
    imports.push(package_.slice(0, i).join('.') + '.');
  function addImport(import_) {
    for (let i = 0; i <= package_.length; ++i)
      imports.push(package_.slice(0, i).map(_ => _ + '.').join('') + import_);
  }
  while (match = importRegExp.exec(text)) {
    const import_ = match[1],
        pos = import_.lastIndexOf('.');
    if (pos < 0)
      continue;
    const head = import_.substring(0, pos + 1),
        tail = import_.substring(pos + 1).trim();
    if (tail === '_')
      addImport(head);
    else if (tail.startsWith('{')) {
      if (tail.endsWith('}')) {
        const pieces = tail.slice(1, -1).split(',').map(_ => _.trim());
        if (pieces.last === '_')
          addImport(head);
        else
          for (const piece of pieces)
            addImport(head + piece);
      }
    } else
      addImport(import_);
  }
  const matches = [];
  for (const [index, type] of types.entries()) {
    const typeName = type.join('.');
    let prefix = 0;
    for (const import_ of imports)
      if (typeName === import_ || import_.endsWith('.') && typeName.startsWith(import_) && import_.length > prefix)
        prefix = import_.length;
    if (prefix === typeName.length || RegExp('\\b' + RegExp.escape(typeName.substring(prefix)) + '\\b').test(text))
      matches.push(index);
  }
  return matches;

  // This is only heuristic to avoid fully parsing Scala code.
  // It doesn't use proper Unicode categories (Lu, Ll, Lo, Lt, Nl, Sm, So).
  // It won't match imports using "`" escapes.
  // It won't match importing piecemeal.
  //
  // TODO: Strip comments.
  const WS = '\t\n\r ',
      OP = '!#%&*+-/:<-@\\\\^|~\x7F';
  const ID = `[\\w$]+(?:_[${OP}])?|[${OP}]+|\`(?:[^\\\\\`]|\\\\[\\w\\W])*\``;
//`
// Import            ::=  ‘import’ ImportExpr {‘,’ ImportExpr}
// ImportExpr        ::=  StableId ‘.’ (id | ‘_’ | ImportSelectors)
// ImportSelectors   ::=  ‘{’ {ImportSelector ‘,’} (ImportSelector | ‘_’) ‘}’
// ImportSelector    ::=  id [‘=>’ id | ‘=>’ ‘_’]

// Path              ::=  StableId
//                     |  [id ‘.’] ‘this’
// StableId          ::=  id
//                     |  Path ‘.’ id
//                     |  [id ‘.’] ‘super’ [ClassQualifier] ‘.’ id
// ClassQualifier    ::=  ‘[’ id ‘]’
/*
  `(?:^|;|\\{|[^${OP}]=>)[${WS}]*import[${WS}]+<...>`
  ImportExpr: `${StableId} \\. (?:${ID}|_|\{(?:${ImportSelector},)*(?:${ImportSelector|_})\})`
  ImportSelector: `${ID}(?:=>(?:${ID}|_))?`
  StableId: `${ID}|<StableId> \\. ${ID}|(?:${ID} \\.)? this \\. ${ID}|(?:${ID} \\.)? super (?:\\[${ID}\\])? \\. ${ID}`
*/
  // multiline
  // TODO
}

function checkForReferencesCSharp(text, types) {
  // Temp hack:
  let match;
  const usings = [], namespaceRegExp = /(?:^|;)\s*namespace\s+([^;{\s]+)/gm;
  while (match = namespaceRegExp.exec(text)) {
    const namespace = match[1].split('.');
    for (let i = 1; i <= namespace.length; ++i)
      usings.push(namespace.slice(0, i).join('.') + '.');
  }
  const usingRegExp = /(?:^|;)\s*using\s+([^;]+)\s*;/gm;
  while (match = usingRegExp.exec(text))
    usings.push(match[1] + '.');
  const matches = [];
  for (const [index, type] of types.entries()) {
    const typeName = type.map(_ => _[0].toUpperCase() + _.substring(1)).join('.');
    let prefix = 0;
    for (const using of usings)
      if (typeName.startsWith(using) && using.length > prefix)
        prefix = using.length;
    if (RegExp('\\b' + RegExp.escape(typeName.substring(prefix)) + '\\b').test(text))
      matches.push(index);
  }
  return matches;
}

function checkForReferencesCpp(text, types) {
  // Temp hack:
  const matches = [];
  for (const [index, type] of types.entries())
    if (RegExp('\\b' + RegExp.escape(type.join('::')) + '\\b').test(text))
      matches.push(index);
  return matches;
}

function isSpatialOSProject(projectPath = '') {
  return fileExists(path.resolve(projectPath, PROJECT_FILE));
}

function findSpatialOSProject(searchPath = '') {
  searchPath = path.resolve(searchPath);
  for (;;) {
    if (fileExists(path.join(searchPath, PROJECT_FILE)))
      return searchPath;
    const up = path.normalize(path.join(searchPath, '..'));
    if (up === searchPath)
      return;
    searchPath = up;
  }
}

// TODO: Ensure behavior with respect to symbolic links is correct.
// Caller must not modify yielded breadcrumbs value.
function* readDirRecursive(basePath, dirFilter = undefined, breadcrumbs = []) {
  for (const file of fs.readdirSync(basePath)) {
    const newPath = path.join(basePath, file),
        stats = fs.statSync(newPath);
    breadcrumbs.push(file);
    if (stats.isDirectory()) {
      if (!dirFilter || dirFilter(newPath, breadcrumbs))
        yield* readDirRecursive(newPath, dirFilter, breadcrumbs);
    } else if (stats.isFile())
      yield [newPath, breadcrumbs];
    breadcrumbs.pop();
  }
}

function fileExists(path) {
  let stat;
  try {
    stat = fs.statSync(path);
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
  }
  return stat && stat.isFile();
}

function directoryExists(path) {
  let stat;
  try {
    stat = fs.statSync(path);
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e;
  }
  return stat && stat.isDirectory();
}

function parseVersion(version) {
  const parts = version.match(/^(\d)+\.(\d+)\.(\d+)(?:-([-\w]*))?$/);
  return parts && parts.slice(1, 4).map(_ => parseInt(_, 10)).concat(parts[4]);
}

function stringifyVersion(version) {
  return version.slice(0, 3).join('.') + (version[3] != null ? '-' + version[3] : '');
}

function errorExit(format, ...args) {
  error(format, ...args);
  process.exit(1);
}

function log(format, ...args) {
  console.log('%s', wordWrap(util.format(format, ...args)));
}

function error(format, ...args) {
  console.error('%s', wordWrap(util.format(format, ...args)));
}

// TODO: Currently assumes 1 code point per displayed character
// (and 1 cell per character - consider tabs).
// TODO: What is correct handling of lines of width
// exactly `width`? For now made `width` less by 1.
function wordWrap(text, width = 79) {
  if (!width)
    return text;
  const result = [];
  for (let line of text.split('\n')) {
    while (line.length > width) {
      const pos = line.lastIndexOf(' ', width);
      if (pos >= 0) {
        result.push(line.substring(0, pos));
        line = line.substring(pos + 1);
      } else {
        result.push(line.substring(0, width));
        line = line.substring(width);
      }
    }
    result.push(line);
  }
  return result.join('\n');
}

function groupRanges(integers) {
  let ranges = [], start, end;
  for (const i of integers)
    if (start !== undefined && i === end + 1)
      ++end;
    else {
      if (start !== undefined)
        ranges.push([start, end]);
      start = end = i;
    }
  if (start !== undefined)
    ranges.push([start, end]);
  return ranges;
}
