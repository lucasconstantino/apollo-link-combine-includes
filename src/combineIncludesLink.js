import { visit } from 'graphql'
import { print } from 'graphql/language/printer'
import { ApolloLink, Observable } from 'apollo-link'
import { BatchLink } from 'apollo-link-batch'

const extractGroupInfo = operation => {
  const variables = {}

  for (let name in operation.variables) {
    if (operation.includes.indexOf(name) === -1) {
      variables[name] = operation.variables[name]
    }
  }

  return {
    key: `${print(operation.query)}|${JSON.stringify(variables)}`,
    includes: operation.includes,
    operationName: operation.operationName,
    variables: variables,
    query: operation.query
  }
}

const batchHandler = (operations, forward) => {
  // Early exit in case only one operation is available.
  if (operations.length === 1) {
    return forward[0](operations[0]).map(result => [result])
  }

  const groups = {}

  for (let i in operations) {
    const { key, includes, variables, operationName, query } = extractGroupInfo(
      operations[i]
    )

    // Ensure group exists.
    groups[key] = groups[key] || {
      operations: [],
      includes: [],
      variables,
      operationName,
      query
    }

    // Attach operation info.
    groups[key].operations.push(operations)

    // Enforce enabled includes.
    for (let j in includes) {
      if (operations[i].variables[includes[j]]) {
        groups[key].variables[includes[j]] = true
      }
    }
  }

  // Use first forward as default.
  // @TODO: this might break context usage from here on!
  const forwarder = forward[0]

  return new Observable(observer => {
    const results = []

    for (let key in groups) {
      const {
        operationName,
        query,
        variables,
        operations: groupOperations
      } = groups[key]

      const combinedOperation = {
        operationName,
        query,
        variables
      }

      // Dispatch operation
      // @TODO: handle errors down the link stream.
      forwarder(combinedOperation).subscribe(result => {
        // Register as many results as there were
        // original operations in this group.
        groupOperations.forEach(() => {
          results.push(result)
        })

        if (results.length === operations.length) {
          observer.next(results)
          observer.complete()
        }
      })
    }
  })
}

/**
 * Group queries per operationName.
 */
const batchKey = ({ operationName }) => operationName || null

/**
 * Determines if an operation can be combined based on the existence
 * of both an operationName and @include directives.
 */
const defaultCanCombine = operation => {
  // Early exit when operation is not named.
  if (!operation.operationName) return false

  let hasIncludes = false

  visit(operation.query, {
    Directive: (
      { name: { value: name }, arguments: args },
      key,
      parent,
      path,
      ancestors
    ) => {
      if (name === 'include') {
        hasIncludes = true

        // Save include variables for further reference.
        operation.includes = (operation.includes || []).concat(
          args[0].value.name.value
        )
      }
    }
  })

  // Early exit when operation has no include directive.
  if (!hasIncludes) return false

  return true
}

export class CombineIncludesLink extends ApolloLink {
  /**
   * The batching link.
   */
  batcher

  /**
   * A callback to determine if an operation can be combined.
   */
  canCombine

  constructor ({
    /**
     * The interval at which to batch, in milliseconds.
     */
    batchInterval = 10,

    /**
     * The maximum number of operations to include in one fetch.
     */
    batchMax = 10,

    /**
     * A custom callback to determine if an operation can be combined.
     *
     * Defaults to accounting
     */
    canCombine = defaultCanCombine
  } = {}) {
    super()

    this.canCombine = canCombine

    this.batcher = new BatchLink({
      batchInterval,
      batchMax,
      batchHandler,
      batchKey
    })
  }

  /**
   * Link query requester.
   */
  request = (operation, forward) =>
    // Can this operation be combined?
    this.canCombine(operation, defaultCanCombine)
      ? this.batcher.request(operation, forward)
      : forward(operation)
}
