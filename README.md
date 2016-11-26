# spatialos-check-components

Tool for checking component usage in a [SpatialOS] project.

## Installation

This utility is intended to run on [Node.js] and is distributed as an [npm]
package. Installing Node.js will also install npm, at which point you can use:

```sh
npm install -g ndkrempel/spatialos-check-components
```

This will make the `check-components` command-line utility available on your
`PATH`. If you receive a permissions error, see [fixing npm permissions].

## Usage

Either run from anywhere within a SpatiaOS project, or specify the path to the
root of a SpatialOS project as a command-line argument:

```sh
check-components [<project_path>]
```

[SpatialOS]: https://www.spatialos.com/
[Node.js]: https://nodejs.org/
[npm]: https://www.npmjs.com/
[fixing npm permissions]: https://docs.npmjs.com/getting-started/fixing-npm-permissions
