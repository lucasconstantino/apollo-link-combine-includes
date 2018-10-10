# Combine Includes Link

[![Build Status](https://travis-ci.org/lucasconstantino/apollo-link-combine-includes.svg?branch=master)](https://travis-ci.org/lucasconstantino/apollo-link-combine-includes)
[![coverage](https://img.shields.io/codecov/c/github/lucasconstantino/graphql-resolvers.svg?style=flat-square)](https://codecov.io/github/lucasconstantino/apollo-link-combine-includes)
[![npm version](https://img.shields.io/npm/v/lucasconstantino/apollo-link-combine-includes.svg?style=flat-square)](https://www.npmjs.com/package/lucasconstantino/apollo-link-combine-includes)
[![sponsored by Taller](https://raw.githubusercontent.com/TallerWebSolutions/tallerwebsolutions.github.io/master/sponsored-by-taller.png)](https://taller.net.br/en/)

## Purpose

An Apollo Link that combines multiple same-query requests using different
include/skip directives into a single query.

## Installation

`npm install apollo-link-combine-includes --save`

## Usage

```js
import { CombineIncludesLink } from 'apollo-link-combine-includes'

const link = new CombineIncludesLink()
```

## Options

Batch Link takes an object with three options on it to customize the behavior of the link. The only required option is the batchHandler function

| name          | value                                                          | default                                     | required |
| ------------- | -------------------------------------------------------------- | ------------------------------------------- | -------- |
| batchInterval | number                                                         | 10                                          | false    |
| batchMax      | number                                                         | 0                                           | false    |
| canCombine    | (operation: Operation, defaultCanCombine: function) => Boolean | Operation has a name and include directives | false    |

## Context

The CombineIncludesLink does not use the context for anything
