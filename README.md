# vue-state-tree

[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jaythomas/vue-state-tree/blob/master/LICENSE.md)

Simplified state management with typechecking and immutability. Vue components serve as both the model and data store.

- [Installation](#installation)
- [Features](#features)
  - [Easy to use](#easy-to-use)
  - [Type checking](#type-checking)
  - [Immutability](#immutability)
- [Why not Vuex?](#why-not-vuex)
- [Why not MobX?](#why-not-mobx)
- [Why not mobx-state-tree?](#why-not-mobx-state-tree)
- [API](#api)
  - [Types API](#types-api)
  - [Adding types](#adding-types)

## Installation

via yarn
```
yarn add vue-state-tree
```
or via npm
```
npm install --save vue-state-tree
```

## Features

### Easy to use

Do you know how to write a Vue component? Good, then you already know how to use this tool!

```js
import { model } from 'vue-state-tree'

const programmer = model({
  name: 'programmer',
  data() {
    return {
      firstName: 'Brian',
      lastName: 'Kernighan',
      language: 'C'
    }
  },
  computed: {
    fullName: {
      get() {
        return this.firstName + ' ' + this.lastName
      },
      set(value) {
        [this.firstName, this.lastName ] = value.split(' ')
      }
    }
  },
  methods: {
    setFirstName(value) {
      this.firstName = value
    }
  }
})
```

Under the hood `model()` is returning a `new Vue()` instance.
This concept was inspired by the Vue guide on [Simple State Management from Scratch](https://vuejs.org/v2/guide/state-management.html#Simple-State-Management-from-Scratch).
These are often called **renderless components** and just about anything you can do with a component you can now do with your model.

### Type checking

Optionally, you can specify a `schema` object for your data model that will run in development, but not in production.
This can be crucial, especially when migrating to using this tool when you want to be very strict with your types in development but also can't afford for production to fail.

```js
import { model, types as t } from 'vue-state-tree'

const programmer = model({
  name: 'programmer',
  data() {
    return {
      firstName: 'Brian',
      lastName: 'Kernighan',
      language: 'C'
    }
  },
  computed: {
    fullName: {
      get() {
        return this.firstName + ' ' + this.lastName
      },
      set(value) {
        [this.firstName, this.lastName ] = value.split(' ')
      }
    }
  },
  methods: {
    setFirstName(value) {
      this.firstName = value
    }
  },
  schema: {
    firstName: t.string,
    lastName: t.string,
    language: t.enum('AMPL', 'AWK', 'B', 'C')
  }
})
```

Schemas can contain nested objects and array, or even *other models*, allowing you to build out a state tree as the name implies:

```js
const schema = {
  preferences: {
    colorTheme: t.enum('lightblue', 'emerald')
  },
  // Forecast should be an array, and if the array has elements they should be weather model objects
  forecast: [t.model('weather')],
  // "updated" object could be null if this object has never been updated, but if
  // the object isn't null then we expect a Luxon DateTime object and a "by" user id
  updated: t.maybeNull({
    at: DateTime.isDateTime,
    by: t.string
  })
}
```

The [types](#types) are simple functions that return `true` or `false`, so they're easy to chain or compose with:

```js
const schema = {
  id: t.string,
	// YYYY-MM-DDTHH:mm:ss.sssZ
	isoDate: v => t.string(v) && !isNaN(new Date(v)),
  // Could be a string or maybe it's null
  email: t.maybeNull(t.string)
}
```

They're generic enough that you can re-use your type checks elsewhere, such as services or a Vue component for prop validation:

```js
import { types as t } from 'vue-state-tree'

export default {
  name: 'myComponent',
  props: {
    currentWeather: {
      required: true,
      validation: t.model('weather')
    }
  },
  created() { ... },
  methods: { ... },
  computed: { ... }
}
```

### Immutability

In order to keep track of where mutation in your data are happening from, all mutations must happen either through a [method](https://vuejs.org/v2/api/#methods) or a [computed setter](https://vuejs.org/v2/api/#computed).
Given the example model above, we can infer this:
```js
programmer.setFirstName('Joe') // ok

programmer.fullName = 'Joe Armstrong' // ok

programmer.language = 'Erlang' // not ok

programmer.setFirstName(null) // also not ok, we specified the property type should be a string
```

To avoid production runtime errors, immutability is not enabled when `process.env.NODE_ENV === 'production'`. This also cuts down on runtime overhead costs in production and makes it easier to debug data from the dev console in a pinch.


## Why not Vuex?

[Vuex](https://vuex.vuejs.org/) is the official state management library for Vue, even getting first class support in vue-devtools. There are many limitations with it:

- No runtime type checking. Instead, it is expected you use Typescript to do compile-time type-checking of your store even if API data can undetermined.
- Components interact directly with `this.$store`, so although you have actions to remove implementation awareness from the components, they are still aware of where the store actions come from. This makes your components **less reusable** in that they now have another input and output in addition to the props they receive and events they emit. Using props to pass data to a component is preferable for utility components that get used across apps and makes the components easier to test.
- Very obvious, but Vuex is designed to work only with Vue. You cannot easily pass around data from the store into components of another library like AngularJS say if you're working on an app currently transitioning to or away from Vue. Vue-state-tree uses Vue under the hood but in theory could be used with an app that doesn't even use Vue.
- No easy way to migrate data to it or away from it. The Vuex store must be operated on through actions, so calling methods from another service will result in errors.
- Boilerplate. You must create actions to interact with methods defined in the Vuex store. Actions often call a single method so you're wrapping your own API with another API? Why is that the default behavior and why must calling methods directly be forbidden? This is a very strong opinion without a strong defense on why this is how things must be. Furthermore, action names are strings, so you must create enums to avoid runtime errors where you typo'd an action name and the wrong thing gets called.

## Why not MobX?

[MobX](https://github.com/mobxjs/mobx) is a library for building models with computed values and methods (actions) in a similar fashion to this tool, but has some caveats that may be a non-starter for Vue users:

- MobX arrays aren't arrays, but an object construct known as `ObservableArray`. **Vue cannot observe mobx ObservableArrays**. This means there is no reactivity in your component if you update a list of table where the data comes from mobx.
- It uses its own observers, so objects observed by both MobX and Vue have double the processing and memory overhead as both libraries decorate the object's prototype in their own way.
- MobX is very unopinionated (which can be a good thing), but that means best practices are left up to you to enforce.

## Why not mobx-state-tree?

[mobx-state-tree](https://github.com/mobxjs/mobx-state-tree) has a great API and lots of features, but some issues are apparent when you start to use it:

- Error messages are very [incomplete or difficult to read](https://github.com/mobxjs/mobx-state-tree/issues/734) in development and [don't even display](https://github.com/mobxjs/mobx-state-tree/issues/1469) in production. 
- Runtime type checks happen in production, so if you rely on data that has a chance of being inconsistent in any way you have to build your models to be very relaxed to avoid production issues. This defeats the purpose of having run-time type checking which you would want to be strict in development and testing so that you can catch errors with your data or model before you get to production.
- Immutability cannot be turned off, even in production. In addition to the problems mentioned in the last point, this means you cannot migrate data from an ES6 class instance to a mobx-state-tree model without completely rewriting it and gutting it out your application. With vue-state-tree, you could pass an object data source currently being used by another service and simply disable immutability until you can deprecate and remove that service.
- Very large codebase. Compare 60-100,000+ lines of code versus a ~220-line node module.
- Unsufficient documentation. Given the large codebase and feature set, there aren't many examples on how to use it to do many of the every-day features you'd expect. Some features like circular references are mentioned in passing but never detailed on how to do.

# API

Since this tool is a wrapper for Vue components, see Vue's [Options Data](https://vuejs.org/v2/api/#Options-Data) API.
In addition to the options mentioned there, any [Vue Plugins](https://vuejs.org/v2/guide/plugins.html) you define to extend the API will naturally extend the API of your models.

### Schema

As mentioned under [type checking](#type-checking), schema objects are optional. They will also only type check whatever properties you define in it.

```js
import { model, types as t } from 'vue-state-tree'

const user = model({
  name: 'user',
  data: {
    id: 1,
    // Not in the schema. So you can use it and mutate it as you please,
    // but consider it an unsafe property until you add it to the schema
    name: 'Joe Armstrong'
  },
  schema: {
    id: t.number
  }
})
```

Schema can also contain nested data:

```js
function booksModel(data) {
  return model({
    name: 'book',
    data,
    methods: {
      addPublisher(publisher) {
        this.publishers.push(publisher)
      }
    },
    schema: {
      id: t.string,
      name: t.string,
      digitalDownload: t.boolean,
      created: t.maybeNull({
        at: t.string,
        by: t.string
      }),
      publishers: [{
        id: t.string,
        name: t.string
      }]
    }
  })
}

const book = booksModel({
  id: '37848de6-784c-40f7-a172-2cc40c7696f3',
  name: 'Delilah Dirk',
  digitalDownload: true,
  created: null,
  author: 'Tony Cliff',
  publishers: [{
    id: 'b0ad3660-eef8-4bd1-9286-db61cbd72be0',
    name: 'First Second Books'
  }]
})

book.addPublisher({ name: 'Jay Thomas' }) // Whoops, forgot the 'id'
// => TypeError: undefined data property at path: <book>.publishers[1].id
```

### Types

- **t.boolean** - Ensure object is `true` or `false`.
- **t.enum** - Ensure object is one of any literals you pass it: `t.enum('hot', 'cold', false, 23)`
- **t.maybeNull** - Value can be either `null` or another type that you pass it, but it can't be `undefined`: `t.maybeNull(t.number)`
- **t.model** - Value should be another model with the given name. `t.model('customer')`
- **t.number** - `typeof value === 'number'`
- **t.string** - `typeof value === 'string'`
- **t.union** - Value can be any of the types you give it: `t.union(t.string, t.number)`

See the `types` object in [index.esm.js](https://github.com/jaythomas/vue-state-tree/blob/master/index.esm.js) for more details.

### Adding types

As mentioned above, the schema object expects values to be either an object, array, or a function.
You can define your own validator functions however you want and the type checker will expect them to return `true` is the function is valid or `false` if invalid.

```js
const yesNoEnum = v => t.maybeNull(t.enum('Yes', 'No'))

const schema = {
  question: t.string,
  // Type that we defined somewhere else
  answer: yesNoEnum,
	// Inline function... should be a string and match the YYYY-MM-DD date format
	timestamp: v => types.string(v) && Boolean(v.match(/^[1-9]\d{3}-[01]\d-[0123]\d/)),
}
```

You could also extend the `types` object directly if you don't feel like importing your types from a different file.
Really, this is better than this tool cluttering your bundle with hundreds of obscure types you'll never use.

```js
import { types } from 'vue-state-tree'
types.inRange = (min, max) => v => types.number(v) && (x - min) * (x - max) <= 0
types.positiveNumber = v => types.number(v) && v > 0

// Some other module elsewhere...
import { types as t } from 'vue-state-tree'
const schema = {
  wrestler: [{
    name: t.string,
    age: t.positiveNumber
    weight: t.inRange(125, 134)
  }]
}
```
