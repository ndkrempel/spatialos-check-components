'use strict';

module.exports = {
  parse,
  Stream,
  StringStream,
  FileStream,
};

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
  const tokenizer = tokenize(stream);
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
    stream.consumeAll(/\s/);
    if (stream.eof())
      break;
    else if (stream.consume('//'))
      stream.consumeUntil('\\n');  // TODO: Can newlines be escaped?
    else if (stream.consume('/*'))
      stream.consumeUntil('*/');
    else if (stream.consume('"'))
      yield {
        type: SchemaToken.STRING,
        value: Array.from(consumeString(stream)).join(''),
      };
    else if (result = stream.consumeAll(/\w/))
      // TODO: Can numbers contain "+", "-", ".", "e", ...?
      yield {
        type: SchemaToken.ALPHANUMERIC,
        value: result,
      };
    else if (result = stream.consume(/[.;<=>{}]/))
      // Or allow any ASCII punctuation? /[!#-\/:-@[-^`{-~]/
      yield {
        type: SchemaToken.PUNCTUATION,
        value: result,
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
      yield result.consume(/[\w\W]/);
    }
  }
}

class Stream {
  constructor() {
    if (new.target === Stream)
      throw TypeError('Cannot instantiate abstract class Stream');
  }
  eof() {}
  consume(...patterns) {}
  consumeUntil(...patterns) {}
  consumeAll(...patterns) {}
  error(message) { throw Error(message); }
}

class StringStream extends Stream {
  constructor(data) {
    super();
    this.data_ = data;
  }
  eof() { return !this.data_.length; }
  consume(...patterns) {
    for (let pattern of patterns) {
      if (pattern instanceof RegExp) {
        
      } else {
        
      }
    }
  }
  // TODO
}

class FileStream extends Stream {
  // TODO
}
