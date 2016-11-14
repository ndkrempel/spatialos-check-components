'use strict';

// Reflect.toObject
polyfillFunction(Reflect, function toObject(value) {
  return Object.assign(value);
});

// Reflect.toInteger
polyfillFunction(Reflect, function toInteger(value) {
  value = Number(value);
  return value >= 0 ? Math.floor(value) : value < 0 ? Math.ceil(value) : 0;
});

// Reflect.toLength
polyfillFunction(Reflect, function toLength(value) {
  value = Reflect.toInteger(value);
  return value <= 0 ? 0 : value > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value;
});

// Reflect.compare
polyfillFunction(Reflect, function compare(lhs, rhs) {
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
});

// Array.compare
polyfillFunction(Array, function compare(lhs, rhs, compareFn = Reflect.compare) {
  lhs = toObject(lhs);
  rhs = toObject(rhs);
  const lhsLen = toLength(lhs.length),
      rhsLen = toLength(rhs.length);
  for (let i = 0; i < Math.min(lhsLen, rhsLen); ++i) {
    const result = compareFn(lhs[i], rhs[i]);
    if (result)
      return result;
  }
  return compare(lhsLen, rhsLen);
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

function polyfillProperty(class_, getter, setter) {
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
