'use strict';

require('./helpers');

// schemas/foo/bar.schema
//   comments: // and /*...*/

//   package <name>.<name>.<name>;
//   import "<path>" (needs semicolon?)
//   component <name> {
//     option <name> = <value>; (synchronized, queryable)
//     id = <component_id>;
//     <type> <name> = <field_id>;
//     event <type> <name>;
//     data <type>;
//   }
//   type <name> {
//     type <name> {
//       ...
//     }
//     enum <name> {
//       ...
//     }
//     <type> <name> = <field_id>;
//   }
//   enum <name> {
//     <name> = <value>;
//   }
//
//   component IDs [,100) and [190000,200000) reserved
//   primitive types:
//     bool
//     uint32, uint64, int32, int64, sint32, sint64
//     fixed32, fixed64, sfixed32, sfixed64
//     float, double
//     string, bytes
//     Coordinates, Vector3d, Vector3f
//     EntityId
//     EntityPosition
//   collection types:
//     option<T>, list<T>, map<K, V> (K integral/enum/string/EntityId)
// can enums or types be nested inside components?

function parse(stream) {
  // TODO
  // return [package, components: [[name, id, synchronized], ...]
  const tokenizer = tap(tokenize(stream));
  let token;
  do
    token = tokenizer.next().value;
  while (token && token.type === Token.PUNCTUATION && token.value === ';')
  if (!token || token.type !== Token.ALPHANUMERIC || token.value !== 'package')
    stream.error('Expecting package declaration.');
  const packageParts = [];
  packageLoop: for (;;) {
    token = tokenizer.next().value;
    if (!token || token.type !== Token.ALPHANUMERIC)
      stream.error('Expecting package name.');
    packageParts.push(token.value);
    token = tokenizer.next().value;
    if (token && token.type === Token.PUNCTUATION)
      switch (token.value) {
        case '.': continue;
        case ';': break packageLoop;
      }
    stream.error('Expecting "." or ";".');
  }
  // TODO
  return [packageParts, []];
  // a full representation might be:
  // {
  //   package: "",
  //   imports: ["", ...],
  //   types: [{
  //     name: "",
  //     type: "type" | "enum",
  //     fields: [<field>],
  //     nested: [<type>],
  //     values: [{
  //       name: "",
  //       value: 0,
  //     }],
  //   }],
  //   components: [{
  //     id: 0,
  //     name: "",
  //     options: [{
  //       name: "",
  //       value: "",
  //     }],
  //     fields: [{
  //       id: 0,
  //       name: "",
  //       type: <typename>,
  //     }],
  //     data: <typename?>,
  //     events: [{
  //       name: "",
  //       type: <typename?>,
  //     }],
  //   }],
  // }
}


const Token = {
  ALPHANUMERIC: 0,
  PUNCTUATION:  1,
  STRING:       2,
};

function* tokenize(stream) {
  for (;;) {
    let result;
    stream.consume(/\s*/); // stream.consumeAll(/\s/);
    if (stream.eof())
      break;
    else if (stream.consume('//'))
      stream.consumeUntil('\n');  // TODO: Can newlines be escaped?
    else if (stream.consume('/*'))
      stream.consumeUntil('*/');
    else if (stream.consume('"'))
      yield {
        type: Token.STRING,
        value: Array.from(consumeString(stream)).join(''),
      };
    else if (result = stream.consume(/\w+/))
    // else if (result = stream.consumeAll(/\w/))
      // TODO: Can numbers contain "+", "-", ".", "e", ...?
      yield {
        type: Token.ALPHANUMERIC,
        value: result[0],
      };
    else if (result = stream.consume(/[.;<=>{}]/))
      // Or allow any ASCII punctuation? /[!#-\/:-@[-^`{-~]/
      yield {
        type: Token.PUNCTUATION,
        value: result[0],
      };
    else
      stream.error('Unexpected input.');
  }

  function* consumeString(stream) {
    for (;;) {
      const {which, inner} = stream.consumeUntil('"', '\\');
      yield inner;
      if (which === 0)
        break;
      yield result.consume(/[\w\W]/)[0];
    }
  }
}

class Stream {
  constructor() {
    if (new.target === Stream)
      throw TypeError('Cannot instantiate abstract class Stream');
  }
  eof() { return true; }
  consume(...patterns) { return null; }
  consumeUntil(...patterns) { return null; }
  consumeAll(...patterns) { return null; }
  // TODO: Add line + column number reporting.
  error(message) { throw Error(message); }
}

class StringStream extends Stream {
  constructor(data) {
    super();
    this.data_ = data + '';
  }
  eof() { return !this.data_.length; }
  consume(...patterns) {
    for (let [which, pattern] of patterns.entries()) {
      if (Reflect.isRegExp(pattern)) {
        const match = regExpExecStart(this.data_, pattern);
        if (match) {
          this.data_ = this.data_.substring(match[0].length);
          delete match.input;
          match.which = which;
          return match;
        }
      } else {
        pattern += '';
        if (this.data_.startsWith(pattern)) {
          this.data_ = this.data_.substring(pattern.length);
          const match = [pattern];
          match.which = which;
          return match;
        }
      }
    }
    return null;
  }
  consumeUntil(...patterns) {
    let firstMatch = null;
    for (let [which, pattern] of patterns.entries()) {
      if (Reflect.isRegExp(pattern)) {
        const match = RegExp(pattern).exec(this.data_);
        if (match && (!firstMatch || match.index < firstMatch.index)) {
          delete match.input;
          match.which = which;
          firstMatch = match;
        }
      } else {
        pattern += '';
        const index = this.data_.indexOf(pattern);
        if (index >= 0 && (!firstMatch || index < firstMatch.index)) {
          firstMatch = [pattern];
          firstMatch.which = which;
          firstMatch.index = index;
        }
      }
    }
    if (firstMatch !== null)
      firstMatch.inner = this.data_.substring(0, firstMatch.index);
    // TODO: firstMatch.outer
    return firstMatch;
  }
  consumeAll(...patterns) {
    // TODO: Hoist RegExp/string conversions out of loop.
    let accumulator = '';
    outer: for (;;) {
      for (let pattern of patterns) {
        if (Reflect.isRegExp(pattern)) {
          const match = regExpExecStart(this.data_, pattern);
          if (match && match[0]) {
            // TODO: Check lastIndex is still in code units when unicode flag set.
            accumulator += this.data_.substring(0, match[0].length);
            this.data_ = this.data_.substring(match[0].length);
            continue outer;
          }
        } else {
          pattern += '';
          if (this.data_.startsWith(pattern)) {
            accumulator += this.data_.substring(0, pattern.length);
            this.data_ = this.data_.substring(pattern.length);
            continue outer;
          }
        }
      }
      return accumulator;
    }
  }
  error(message) {
    super.error(message + '\n  "' + this.data_.match(/^[^\n]{0,30}/)[0] + '"...\n   ^');
  }
}

class FileStream extends Stream {
  // TODO
}

function regExpExecStart(string, regExp) {
  let flags = regExp.flags;
  if (!flags.includes('y'))
    flags += 'y';
  return RegExp(regExp.source, flags).exec(string);
}

// TODO: Remove.
function* tap(iterator) {
  for (;;) {
    const next = iterator.next();
    console.log('%j', next);
    if (next.done)
      return next.value;
    yield next.value;
  }
}

module.exports = {
  parse,
  Stream,
  StringStream,
  FileStream,
};
