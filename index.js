#!/usr/bin/env node --throw-deprecation --use_strict

// TODO: Setup linting, preprocessing, compiling/minifying, testing.
// TODO: Add missing fields to "package.json".
// TODO: Use Winston/Bunyan for logging.
// TODO: ANSI color with custom string literal.
//     (See chalk, colors, cli-color, ansi, ansicolors, terminal-kit, manakin.)
//     Configuration by command-line options, default auto-detect.
//     Forked logging with different settings, including color setting?

'use strict';

const assert = require('assert'),
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
    WORKER_FILE = 'spatialos_worker.json';

program.version('0.0.0')
  .description('Tool for checking component usage in a SpatialOS project.')
  .arguments('[project_path]')
  .parse(process.argv);

if (program.args.length > 1) {
  program.outputHelp();
  process.exit(1);
}

const projectPath = (() => {
  if (program.args.length) {
    let path = program.args[0];
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

const schemaPath = path.join(projectPath, SCHEMA_DIR);
assert(directoryExists(schemaPath), 'Schema directory not present');
log('Scanning schema definitions...');
for (let [file, breadcrumbs] of readDirRecursive(schemaPath)) {
  if (!breadcrumbs.last.endsWith(SCHEMA_EXT))
    continue;
  log('==> %s', breadcrumbs.join('/'));
  // TODO: Is UTF-8 the right encoding?
  const data = fs.readFileSync(file, 'utf8')
  // TODO: Use schema.FileStream to avoid reading entire file into a string.
  const s = schema.parse(new schema.StringStream(data));
  for (const component of s.components) {
    log('      (%d) %s', component.id, [].concat(s.package, component.name).join('.'));
  }
}

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
// GSim (Scala)
// Scala?
// Unity: worker, client (C#)
// C?
// C++
// C#
// Unreal?
// Java
// JavaScript
// ...

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
function* readDirRecursive(basePath, breadcrumbs = []) {
  for (let file of fs.readdirSync(basePath)) {
    const newPath = path.join(basePath, file),
        stats = fs.statSync(newPath);
    breadcrumbs.push(file);
    if (stats.isDirectory())
      yield* readDirRecursive(newPath, breadcrumbs);
    else if (stats.isFile())
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
