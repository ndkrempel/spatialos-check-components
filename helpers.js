'use strict';

// Reflect.toObject
polyfillFunction(Reflect, function toObject(value) {
  return Object.assign(value);
});

// Reflect.toInteger
polyfillFunction(Reflect, function toInteger(value) {
  value = +value;
  return value >= 0 ? Math.floor(value) : value < 0 ? Math.ceil(value) : 0;
});

// Reflect.toLength
polyfillFunction(Reflect, function toLength(value) {
  value = Reflect.toInteger(value);
  return value <= 0 ? 0 : value > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value;
});

// Reflect.isObject
polyfillFunction(Reflect, function isObject(value) {
  switch (typeof value) {
    // Handle ghost objects like "document.all".
    case 'undefined': return value !== undefined;
    case 'boolean':
    case 'number':
    case 'string':
    case 'symbol':    return false;
    case 'object':    return value !== null;
    default:          return true;
  }
});

// Reflect.typeOf
polyfillFunction(Reflect, function typeOf(value) {
  switch (typeof value) {
    // Handle ghost objects like "document.all".
    case 'undefined': return value === undefined ? 'undefined' : 'object';
    case 'boolean':   return 'boolean';
    case 'number':    return 'number';
    case 'string':    return 'string';
    case 'symbol':    return 'symbol';
    case 'object':    return value === null ? 'null' : 'object';
    default:          return 'object';
  }
});

// Reflect.getTag
polyfillFunction(Reflect, function getTag(value) {
  return Object.prototype.toString.call(value).slice(8, -1);
});

// Reflect.isRegExp
polyfillFunction(Reflect, function isRegExp(value) {
  // TODO
  // typeOf(value) === 'object'
  // value.@@match !== undefined: ToBoolean(_)
  // has [[RegExpMatcher]]
  if (!Reflect.isObject(value))
    return false;
  const match = value[Symbol.match];
  if (match !== undefined)
    return !!match;
  // The following test needs RegExp#compile to be present, which is only guaranteed in web browser environments.
  const prop = Object.getOwnPropertyDescriptor(value, 'lastIndex');
  if (prop.configurable || !prop.hasOwnProperty('value'))
    return false;
  const compile = RegExp.prototype.compile;
  if (compile === undefined)
    throw Error('Missing RegExp.prototype.compile');
  try {
    compile.call(value, value);
  } catch (e) {
    if (e instanceof TypeError) {
      // The following assumes a standard error message for assigning to a read only property.
      if (!prop.writable && e.message.startsWith('Cannot assign to read only property'))
        return true;
      return false;
    }
    throw e;
  }
  return true;
  // The following check is not correct in the presence of @@toStringTag overrides.
  // return Reflect.getTag(value) === 'RegExp';
});

// Reflect.compare
polyfillFunction(Reflect, function compare(lhs, rhs) {
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
});

// Array.compare
polyfillFunction(Array, function compare(lhs, rhs, compareFn = Reflect.compare) {
  lhs = Reflect.toObject(lhs);
  rhs = Reflect.toObject(rhs);
  const lhsLen = Reflect.toLength(lhs.length),
      rhsLen = Reflect.toLength(rhs.length);
  for (let i = 0; i < Math.min(lhsLen, rhsLen); ++i) {
    const result = compareFn(lhs[i], rhs[i]);
    if (result)
      return result;
  }
  return compare(lhsLen, rhsLen);
});

// Array#empty
polyfillProperty(Array, function empty() {
  const array = Reflect.toObject(this);
  return !Reflect.toLength(array.length);
});

// Array#head
polyfillProperty(Array, function head() {
  const array = Reflect.toObject(this);
  return Reflect.toLength(array.length) ? array[0] : undefined;
}, function head(rhs) {
  Reflect.toObject(this)[0] = rhs;
});

// Array#last
polyfillProperty(Array, function last() {
  const array = Reflect.toObject(this),
      len = Reflect.toLength(array.length);
  return len ? array[len - 1] : undefined;
}, function last(rhs) {
  const array = Reflect.toObject(this),
      len = Reflect.toLength(array.length);
  array[len ? len - 1 : 0] = rhs;
});

// TODO:
// String#padLeft, String#padRight
// String#matchFull / RegExp#execAll

// RegExp.escape
polyfillFunction(RegExp, function escape(value) {
  return value.replace(/[$(-+.?[-^{|}]/g, '\\$&');
});

function polyfillFunction(object, method) {
  return definePropertyIfMissing(object, method.name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: method,
  });
}

function polyfillMethod(class_, method) {
  return definePropertyIfMissing(class_.prototype, method.name, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: method,
  });
}

function polyfillProperty(class_, getter, setter = undefined) {
  return definePropertyIfMissing(class_.prototype, getter.name, {
    configurable: true,
    enumerable: false,
    get: getter,
    set: setter,
  });
}

function definePropertyIfMissing(object, name, descriptor) {
  if (object.hasOwnProperty(name))
    return false;
  Object.defineProperty(object, name, descriptor);
  return true;
}
