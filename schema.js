'use strict';

require('./helpers');

const PRIMITIVE_TYPES = [
  'bool',
  'uint32', 'uint64', 'int32', 'int64', 'sint32', 'sint64',
  'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
  'float', 'double',
  'string', 'bytes',
  'Coordinates', 'Vector3d', 'Vector3f',
  'EntityId',
  'EntityPosition',
];

const COLLECTION_TYPES = [
  'option', 'list',
  'map',
];

function parse(stream) {
  return parseSchema(new TokenStream(tokenize(stream)));
}

function parseSchema(stream) {
  const schema = {};
  let token;
  // TODO: Stray semicolons allowed?
  while (stream.tryConsumePunctuation(';'));
  stream.consumeIdentifier('package');
  schema.package = [];
  packageLoop: for (;;) {
    schema.package.push(stream.consumeIdentifier());
    if (stream.tryConsumePunctuation(';'))
      break;
    stream.consumePunctuation('.');
  }
  schema.imports = [];
  for (;;) {
    while (stream.tryConsumePunctuation(';'));
    if (!stream.tryConsumeIdentifier('import'))
      break;
    schema.imports.push(stream.consumeString());
    stream.consumePunctuation(';');
  }
  schema.components = [];
  schema.types = [];
  while (!stream.eof()) {
    switch (stream.consumeIdentifier()) {
      case 'component':
        schema.components.push(parseComponent(stream));
        break;
      case 'type':
        schema.types.push(parseType(stream));
        break;
      case 'enum':
        schema.type.push(parseEnum(stream));
        break;
      default:
        stream.error('Unknown keyword.');
    }
    while (stream.tryConsumePunctuation(';'));
  }
  return schema;
}

function parseComponent(stream) {
  const component = {};
  component.name = stream.consumeIdentifier();
  stream.consumePunctuation('{');
  component.options = [];
  component.fields = [];
  component.events = [];
  while (!stream.tryConsumePunctuation('}')) {
    // TODO: Allow stray semicolons?
    // TODO: Can enums or types be nested inside components?
    if (stream.tryConsumeIdentifier('option')) {
      // TODO: Must options come first in a component?
      const option = {};
      option.name = stream.consumeIdentifier();
      stream.consumePunctuation('=');
      if (stream.tryConsumeIdentifier('false'))
        option.value = false;
      else if (stream.tryConsumeIdentifier('true'))
        option.value = true;
      else if (option.value = stream.tryConsumeNumber());
      else if (option.value = stream.tryConsumeString());
      else
        stream.error('Expecting boolean, integer or string.');
      stream.consumePunctuation(';');
      component.options.push(option);
    } else if (stream.tryConsumeIdentifier('id')) {
      if (component.id !== undefined)
        stream.error('Duplicate id definition for component.');
      stream.consumePunctuation('=');
      component.id = stream.consumeNumber();
      stream.consumePunctuation(';');
    } else if (stream.tryConsumeIdentifier('data')) {
      if (component.data !== undefined)
        stream.error('Duplicate data declaration for component.');
      component.data = parseTypeRef(stream);
      stream.consumePunctuation(';');
    } else if (stream.tryConsumeIdentifier('event')) {
      const event = {};
      event.type = parseTypeRef(stream);
      event.name = stream.consumeIdentifier();
      stream.consumePunctuation(';');
      component.events.push(event);
    } else {
      const field = {};
      field.type = parseTypeRef(stream);
      field.name = stream.consumeIdentifier();
      stream.consumePunctuation('=');
      field.id = stream.consumeNumber();
      stream.consumePunctuation(';');
      component.fields.push(field);
    }
  }
  return component;
}

function parseType(stream) {
  const type = {};
  type.name = stream.consumeIdentifier();
  type.type = 'type';
  stream.consumePunctuation('{');
  type.fields = [];
  type.nested = [];
  while (!stream.tryConsumePunctuation('}')) {
    // TODO: Allow stray semicolons?
    if (stream.tryConsumeIdentifier('type'))
      type.nested.push(parseType(stream));
    else if (stream.tryConsumeIdentifier('enum'))
      type.nested.push(parseEnum(stream));
    else {
      const field = {};
      field.type = parseTypeRef(stream);
      field.name = stream.consumeIdentifier();
      stream.consumePunctuation('=');
      field.id = stream.consumeNumber();
      stream.consumePunctuation(';');
      component.fields.push(field);
    }
  }
  return type;
}

function parseEnum(stream) {
  const enum_ = {};
  enum_.name = stream.consumeIdentifier();
  enum_.type = 'enum';
  stream.consumePunctuation('{');
  enum_.values = [];
  while (!stream.tryConsumePunctuation('}')) {
    // TODO: Allow stray semicolons?
    const name = stream.consumeIdentifier();
    stream.consumePunctuation('=');
    const value = stream.consumeNumber();
    stream.consumePunctuation(';');
    enum_.values.push({name, value});
  }
  return enum_;
}

function parseTypeRef(stream) {
  let name;
  for (name of PRIMITIVE_TYPES)
    if (stream.tryConsumeIdentifier(name))
      return {name};
  if (name = (stream.tryConsumeIdentifier('option') || stream.tryConsumeIdentifier('list'))) {
    stream.consumePunctuation('<');
    const valueType = parseTypeRef(stream);
    stream.consumePunctuation('>');
    return {name, valueType};
  } else if (name = stream.tryConsumeIdentifier('map')) {
    stream.consumePunctuation('<');
    const keyType = parseTypeRef(stream);
    stream.consumePunctuation(',');
    const valueType = parseTypeRef(stream);
    stream.consumePunctuation('>');
    return {name, keyType, valueType};
  }
  const parts = [];
  if (stream.tryConsumePunctuation('.'))
    parts.push('');
  do
    parts.push(stream.consumeIdentifier());
  while (stream.tryConsumePunctuation('.'));
  return {name: parts};
}

class TokenStream {
  constructor(iterator) {
    this.iterator_ = iterator;
    this.consume();
  }
  eof() { return !this.next_; }
  peek() { return this.next_; }
  consume() {
    const current = this.next_;
    this.next_ = this.iterator_.next().value;
    return current;
  }
  consumeIdentifier(value = undefined) {
    const result = this.tryConsumeIdentifier(value);
    if (result === undefined)
      this.error(value === undefined ? 'Expecting identifier.' : 'Expecting identifier "' + value + '".');
    return result;
  }
  tryConsumeIdentifier(value = undefined) {
    if (this.next_ && this.next_.type === Token.IDENTIFIER && (value === undefined || this.next_.value === value))
      return this.consume().value;
  }
  consumeNumber() {
    const result = this.tryConsumeNumber();
    if (result === undefined)
      this.error('Expecting number.');
    return result;
  }
  tryConsumeNumber() {
    if (this.next_ && this.next_.type === Token.NUMBER)
      return this.consume().value;
  }
  consumeString() {
    const result = this.tryConsumeString();
    if (result === undefined)
      this.error('Expecting string.');
    return result;
  }
  tryConsumeString() {
    if (this.next_ && this.next_.type === Token.STRING)
      return this.consume().value;
  }
  consumePunctuation(value = undefined) {
    const result = this.tryConsumePunctuation(value);
    if (result === undefined)
      this.error(value === undefined ? 'Expecting punctuation.' : 'Expecting "' + value + '".');
    return result;
  }
  tryConsumePunctuation(value = undefined) {
    if (this.next_ && this.next_.type === Token.PUNCTUATION && (value === undefined || this.next_.value === value))
      return this.consume().value;
  }
  error(message) { throw Error(message); }
}

const Token = {
  IDENTIFIER:  0,
  NUMBER:      1,
  STRING:      2,
  PUNCTUATION: 3,
};

function* tokenize(stream) {
  for (;;) {
    let result;
    stream.consume(/\s*/); // stream.consumeAll(/\s/);
    if (stream.eof())
      break;
    else if (stream.consume('//'))
      // TODO: Can newlines be escaped?
      stream.consumeUntil('\n', /$/);
    else if (stream.consume('/*'))
      stream.consumeUntil('*/') || stream.error('Reached end of stream while in block comment.');
    else if (stream.consume('"'))
      yield {
        type: Token.STRING,
        value: Array.from(consumeString(stream)).join(''),
      };
    else if (result = stream.consume(/[A-Za-z_]\w*/))
      yield {
        type: Token.IDENTIFIER,
        value: result[0],
      };
    else if (result = stream.consume(/[0-9]\w*/)) {
      // TODO: Can numbers contain "+", "-", ".", "e", ...? Have leading "0"? "x"?
      // TODO: Cope with numbers > 2**52.
      if (!/[1-9]\d{0,19}/.test(result[0]))
        stream.error('Bad number.');
      yield {
        type: Token.NUMBER,
        value: parseInt(result[0], 10),
      }
    }
    else if (result = stream.consume(/[,.;<=>{}]/))
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
      const {which, inner} = stream.consumeUntil('"', '\\') || stream.error('Reached end of stream while in string.');
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
    if (firstMatch !== null) {
      firstMatch.inner = this.data_.substring(0, firstMatch.index);
      this.data_ = this.data_.substring(firstMatch.index + firstMatch[0].length);
    }
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
  PRIMITIVE_TYPES,
  COLLECTION_TYPES,
  parse,
  Stream,
  StringStream,
  FileStream,
};
