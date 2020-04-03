import Vue from 'vue'
import get from 'lodash.get'

export function model(storeOptions, modelOptions = {}) {
  if (!storeOptions.data) {
    throw new Error('Undefined model data.')
  }
  if (storeOptions.data._isVue) {
    throw new Error('Attempting to create a model from a model')
  }
  // Sanitize input
  const vm = {
    name: storeOptions.name || `ANONYMOUS_MODEL`,
    data: storeOptions.data,
    computed: storeOptions.computed || {},
    watch: storeOptions.watch || {},
    methods: storeOptions.methods || {}
  }
  // Any array of string expressions to pass to vm.$watch.
  // We're only going to watch properties defined in the schema
  // If we attempted a deep watch the $data directly we would
  // hit circular data structures and cause a stack overflow.
  // One shortcoming with this implementation is arrays aren't
  // watched as they need to be watched from a function versus
  // a string expression. https://vuejs.org/v2/api/#vm-watch
  let watchProps = []
  if (process.env.NODE_ENV !== 'production' && storeOptions.schema) {
    watchProps = getWatchProperties(storeOptions.schema)
  }

  let component

  //
  // IMMUTABILITY MECHANISM
  //
  if (modelOptions.immutable !== false && process.env.NODE_ENV !== 'production') {
    // Wrap functions to interface with the mutex
    Object.entries(vm.computed).forEach(([key, value]) => {
      if (typeof value === 'object' && value.set) {
        const setter = value.set
        value.set = function(...args) {
          // When a method or setter is actively mutating the state it will
          // increment the mutex number. Any number above 0 means the data
          // store is mutable. This is preferred over using a boolean since
          // asynchronous functions could both flip the store to mutability
          // and you want it to stay that way until all threads are satisfied
          // and the mutex can return back to 0. This has the limitation that
          // a prolonged API call could leave the store mutable for multiple
          // seconds for direct store mutation to sneak by but practically
          // speaking this scenario isn't worth accounting for... YAGNI.
          this._mutex += 1
          // Pass through any return values from the computed setter
          return setter.apply(this, args)
        }
      }
    })
    Object.entries(vm.methods).forEach(([key, value]) => {
      vm.methods[key] = function(...args) {
        this._mutex += 1
        return value.apply(this, args)
      }
    })

    const watchCallback = function watchCallback() {
      if (this._mutex === 0) {
        throw new Error(
          `${vm.name} store is immutable! Updates must happen within a method or computed setter.`
        )
      } else if (this._mutex < 0) {
        throw new Error(`Somehow the mutex is off in ${vm.name}. This should never happen.`)
      }
      this._mutex -= 1
    }

    component = new Vue(vm)
    component._mutex = 0
    watchProps.forEach(propExpression => component.$watch(propExpression, watchCallback))
  } else {
    component = new Vue(vm)
  }

  //
  // TYPE CHECKING
  //
  if (process.env.NODE_ENV !== 'production' && storeOptions.schema) {
    // Pre-flight check
    deepTypeCheck(vm.data, storeOptions.schema, [`<${vm.name}>`])
    // Post instantiation checks
    watchProps.forEach(propExpression => {
      component.$watch(propExpression, value => {
        deepTypeCheck(value, get(storeOptions.schema, propExpression), [
          `<${vm.name}>`,
          propExpression
        ])
      })
    })
  }

  return component
}

export const types = {
  boolean: v => typeof v === 'boolean',

  // E.g., t.enum('completed', 'postpartum', 'prenatal')
  enum: (...literals) => v => literals.some(literal => v === literal),

  // Value can be null or another given type (but never undefined)
  // e.g., t.maybeNull(t.union(t.string, t.number))
  maybeNull: anotherType => {
    if (!anotherType) {
      throw new TypeError('You must pass an object or type function to maybeNull()')
    }
    if (typeof anotherType === 'object') {
      return (v, path) => {
        if (v === null) {
          return true
        }
        // Continue on traversing if it's not null
        deepTypeCheck(v, anotherType, path)
        return true
      }
    }
    return v => v === null || anotherType(v)
  },

  // Enforce object is a model with the given name.
  // Takes no nested arguments for validation as any
  // further validation should be done within that model
  model: name => v => v._isVue && v.$options.name === name,

  number: v => typeof v === 'number',

  string: v => typeof v === 'string',

  // Compose a set of possible types, e.g., t.union(t.string, t.number)
  union: (...args) => {
    return v => args.some(arg => arg(v))
  }
}

function deepTypeCheck(dataStore, schema, path) {
  // Sanity checks
  if (!schema) {
    throw new Error(`invalid schema property for path: ${stringifyPath(path)}`)
  } else if (dataStore === undefined) {
    throw new TypeError(`undefined data property at path: ${stringifyPath(path)}`)
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(dataStore)) {
      throw new TypeError(
        `expected array for data property at path ${stringifyPath(path)}, Got: ${JSON.stringify(
          dataStore
        )}`
      )
      // If the schema defined an array, traverse possible sub-schema
    } else if (schema[0] && typeof schema[0] === 'object') {
      dataStore.forEach((value, idx) => {
        deepTypeCheck(value, schema[0], [...path, idx])
      })
      // It should be a flat array
    } else if (schema[0] && typeof schema[0] === 'function') {
      dataStore.forEach((value, idx) => {
        typeCheck(value, schema[0], [...path, idx])
      })
    }
  } else if (schema && typeof schema === 'object') {
    Object.keys(schema).forEach(key => {
      if (isObject(schema[key]) && !isObject(dataStore[key])) {
        throw new TypeError(
          `expected object for data property at path ${stringifyPath([
            ...path,
            key
          ])}, Got: ${JSON.stringify(dataStore[key])}`
        )
      }
      deepTypeCheck(dataStore[key], schema[key], [...path, key])
    })
  } else {
    typeCheck(dataStore, schema, path)
  }
}

function isObject(value) {
  return value && !Array.isArray(value) && typeof value === 'object'
}

// Return a flattened string array of keys that need to be watched
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
    return function reducer(acc, [key, val], idx, arr) {
      if (typeof val === 'object' && !Array.isArray(val)) {
        return Object.entries(val).reduce(getReducerForPath(path.concat(key)), acc)
      }
      return acc.concat(path.concat(key).join('.'))
    }
  }
  return Object.entries(schema).reduce(getReducerForPath([]), [])
}

// Used to generate the path you see in model TypeErrors
// ['<pregnancy>', 'document', 'visits', 1, 'date'] => '<pregnancy>.document.visits[1].date'
function stringifyPath(path) {
  return path.reduce((acc, el) => {
    if (typeof el === 'number') {
      return `${acc}[${el}]`
    }
    return `${acc}.${el}`
  })
}

function typeCheck(value, validator, path) {
  if (!validator(value, path)) {
    throw new TypeError(
      `check failed for data property at path ${stringifyPath(path)}. Got: ${JSON.stringify(value)}`
    )
  }
}
