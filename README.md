# Combine Includes Link

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
