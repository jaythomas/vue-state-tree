"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.model = model;
exports.types = void 0;

var _toConsumableArray2 = _interopRequireDefault(require("@babel/runtime/helpers/toConsumableArray"));

var _typeof2 = _interopRequireDefault(require("@babel/runtime/helpers/typeof"));

var _slicedToArray2 = _interopRequireDefault(require("@babel/runtime/helpers/slicedToArray"));

var _vue = _interopRequireDefault(require("vue"));

var _lodash = _interopRequireDefault(require("lodash.get"));

function model(storeOptions) {
  var modelOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  if (!storeOptions.data) {
    throw new Error('Undefined model data.');
  }

  if (storeOptions.data._isVue) {
    throw new Error('Attempting to create a model from a model');
  } // Sanitize input


  var vm = {
    name: storeOptions.name || "ANONYMOUS_MODEL",
    data: storeOptions.data,
    computed: storeOptions.computed || {},
    watch: storeOptions.watch || {},
    methods: storeOptions.methods || {}
  }; // Any array of string expressions to pass to vm.$watch.
  // We're only going to watch properties defined in the schema
  // If we attempted a deep watch the $data directly we would
  // hit circular data structures and cause a stack overflow.
  // One shortcoming with this implementation is arrays aren't
  // watched as they need to be watched from a function versus
  // a string expression. https://vuejs.org/v2/api/#vm-watch

  var watchProps = [];

  if (process.env.NODE_ENV !== 'production' && storeOptions.schema) {
    watchProps = getWatchProperties(storeOptions.schema);
  }

  var component; //
  // IMMUTABILITY MECHANISM
  //

  if (modelOptions.immutable !== false && process.env.NODE_ENV !== 'production') {
    // Wrap functions to interface with the mutex
    Object.entries(vm.computed).forEach(function (_ref) {
      var _ref2 = (0, _slicedToArray2["default"])(_ref, 2),
          key = _ref2[0],
          value = _ref2[1];

      if ((0, _typeof2["default"])(value) === 'object' && value.set) {
        var setter = value.set;

        value.set = function () {
          // When a method or setter is actively mutating the state it will
          // increment the mutex number. Any number above 0 means the data
          // store is mutable. This is preferred over using a boolean since
          // asynchronous functions could both flip the store to mutability
          // and you want it to stay that way until all threads are satisfied
          // and the mutex can return back to 0. This has the limitation that
          // a prolonged API call could leave the store mutable for multiple
          // seconds for direct store mutation to sneak by but practically
          // speaking this scenario isn't worth accounting for... YAGNI.
          this._mutex += 1; // Pass through any return values from the computed setter

          for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }

          return setter.apply(this, args);
        };
      }
    });
    Object.entries(vm.methods).forEach(function (_ref3) {
      var _ref4 = (0, _slicedToArray2["default"])(_ref3, 2),
          key = _ref4[0],
          value = _ref4[1];

      vm.methods[key] = function () {
        this._mutex += 1;

        for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }

        return value.apply(this, args);
      };
    });

    var watchCallback = function watchCallback() {
      if (this._mutex === 0) {
        throw new Error("".concat(vm.name, " store is immutable! Updates must happen within a method or computed setter."));
      } else if (this._mutex < 0) {
        throw new Error("Somehow the mutex is off in ".concat(vm.name, ". This should never happen."));
      }

      this._mutex -= 1;
    };

    component = new _vue["default"](vm);
    component._mutex = 0;
    watchProps.forEach(function (propExpression) {
      return component.$watch(propExpression, watchCallback);
    });
  } else {
    component = new _vue["default"](vm);
  } //
  // TYPE CHECKING
  //


  if (process.env.NODE_ENV !== 'production' && storeOptions.schema) {
    // Pre-flight check
    deepTypeCheck(vm.data, storeOptions.schema, ["<".concat(vm.name, ">")]); // Post instantiation checks

    watchProps.forEach(function (propExpression) {
      component.$watch(propExpression, function (value) {
        deepTypeCheck(value, (0, _lodash["default"])(storeOptions.schema, propExpression), ["<".concat(vm.name, ">"), propExpression]);
      });
    });
  }

  return component;
}

var types = {
  "boolean": function boolean(v) {
    return typeof v === 'boolean';
  },
  // E.g., t.enum('completed', 'postpartum', 'prenatal')
  "enum": function _enum() {
    for (var _len3 = arguments.length, literals = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
      literals[_key3] = arguments[_key3];
    }

    return function (v) {
      return literals.some(function (literal) {
        return v === literal;
      });
    };
  },
  // Value can be null or another given type (but never undefined)
  // e.g., t.maybeNull(t.union(t.string, t.number))
  maybeNull: function maybeNull(anotherType) {
    if (!anotherType) {
      throw new TypeError('You must pass an object or type function to maybeNull()');
    }

    if ((0, _typeof2["default"])(anotherType) === 'object') {
      return function (v, path) {
        if (v === null) {
          return true;
        } // Continue on traversing if it's not null


        deepTypeCheck(v, anotherType, path);
        return true;
      };
    }

    return function (v) {
      return v === null || anotherType(v);
    };
  },
  // Enforce object is a model with the given name.
  // Takes no nested arguments for validation as any
  // further validation should be done within that model
  model: function model(name) {
    return function (v) {
      return v._isVue && v.$options.name === name;
    };
  },
  number: function number(v) {
    return typeof v === 'number';
  },
  string: function string(v) {
    return typeof v === 'string';
  },
  // Compose a set of possible types, e.g., t.union(t.string, t.number)
  union: function union() {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }

    return function (v) {
      return args.some(function (arg) {
        return arg(v);
      });
    };
  }
};
exports.types = types;

function deepTypeCheck(dataStore, schema, path) {
  // Sanity checks
  if (!schema) {
    throw new Error("invalid schema property for path: ".concat(stringifyPath(path)));
  } else if (dataStore === undefined) {
    throw new TypeError("undefined data property at path: ".concat(stringifyPath(path)));
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(dataStore)) {
      throw new TypeError("expected array for data property at path ".concat(stringifyPath(path), ", Got: ").concat(JSON.stringify(dataStore))); // If the schema defined an array, traverse possible sub-schema
    } else if (schema[0] && (0, _typeof2["default"])(schema[0]) === 'object') {
      dataStore.forEach(function (value, idx) {
        deepTypeCheck(value, schema[0], [].concat((0, _toConsumableArray2["default"])(path), [idx]));
      }); // It should be a flat array
    } else if (schema[0] && typeof schema[0] === 'function') {
      dataStore.forEach(function (value, idx) {
        typeCheck(value, schema[0], [].concat((0, _toConsumableArray2["default"])(path), [idx]));
      });
    }
  } else if (schema && (0, _typeof2["default"])(schema) === 'object') {
    Object.keys(schema).forEach(function (key) {
      if (isObject(schema[key]) && !isObject(dataStore[key])) {
        throw new TypeError("expected object for data property at path ".concat(stringifyPath([].concat((0, _toConsumableArray2["default"])(path), [key])), ", Got: ").concat(JSON.stringify(dataStore[key])));
      }

      deepTypeCheck(dataStore[key], schema[key], [].concat((0, _toConsumableArray2["default"])(path), [key]));
    });
  } else {
    typeCheck(dataStore, schema, path);
  }
}

function isObject(value) {
  return value && !Array.isArray(value) && (0, _typeof2["default"])(value) === 'object';
} // Return a flattened string array of keys that need to be watched
// EG:
// [
//   'pregnancy.id',
//   'pregnancy.document',
//   'pregnancy.document.discharge_information',
//   'pregnancy.document.discharge_information.feeding_method',
//   'pregnancy.document.visits'
//   ...
// ]


function getWatchProperties(schema) {
  function getReducerForPath(path) {
    return function reducer(acc, _ref5, idx, arr) {
      var _ref6 = (0, _slicedToArray2["default"])(_ref5, 2),
          key = _ref6[0],
          val = _ref6[1];

      if ((0, _typeof2["default"])(val) === 'object' && !Array.isArray(val)) {
        return Object.entries(val).reduce(getReducerForPath(path.concat(key)), acc);
      }

      return acc.concat(path.concat(key).join('.'));
    };
  }

  return Object.entries(schema).reduce(getReducerForPath([]), []);
} // Used to generate the path you see in model TypeErrors
// ['<pregnancy>', 'document', 'visits', 1, 'date'] => '<pregnancy>.document.visits[1].date'


function stringifyPath(path) {
  return path.reduce(function (acc, el) {
    if (typeof el === 'number') {
      return "".concat(acc, "[").concat(el, "]");
    }

    return "".concat(acc, ".").concat(el);
  });
}

function typeCheck(value, validator, path) {
  if (!validator(value, path)) {
    throw new TypeError("check failed for data property at path ".concat(stringifyPath(path), ". Got: ").concat(JSON.stringify(value)));
  }
}
