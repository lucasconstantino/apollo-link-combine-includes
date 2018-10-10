import { visit } from 'graphql'
import { print } from 'graphql/language/printer'
import { ApolloLink, Observable, createOperation } from 'apollo-link'
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
    const { key, includes, variables, operationName, query, extensions = {} } = extractGroupInfo(
      operations[i]
    )

    // Ensure group exists.
    groups[key] = groups[key] || {
      operations: [],
      includes: [],
      variables,
      operationName,
      query,
      extensions
    }

    // Attach operation info.
    groups[key].operations.push(operations[i])

    // Merge extensions.
    groups[key].extensions = { ...groups[key].extensions, ...extensions }

    // Enforce enabled includes.
    for (let j in includes) {
      groups[key].variables[includes[j]] =
        groups[key].variables[includes[j]] ||
        operations[i].variables[includes[j]]
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
        extensions,
        operations: groupOperations
      } = groups[key]

      const combinedContext = groupOperations.reduce(
        (combined, operation) => ({ ...combined, ...operation.getContext() }),
        {}
      )

      const combinedOperation = createOperation(combinedContext, {
        operationName,
        query,
        variables,
        extensions
      })

      // Dispatch operation
      // @TODO: handle errors down the link stream.
      forwarder(combinedOperation).subscribe(result => {
        groupOperations.forEach(operation => {
          const context = combinedOperation.getContext()
          context.httpResponse = context.response
          // Save response context.
          operation.setContext(context)
          // Register as many results as there were
          // original operations in this group.
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

  constructor({
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

  normalizeResponse = operation => result => {
    const context = operation.getContext()
    context.response = context.httpResponse
    operation.setContext(context)
    return result
  }

  /**
   * Link query requester.
   */
  request = (operation, forward) =>
    // Can this operation be combined?
    this.canCombine(operation, defaultCanCombine)
      ? this.batcher
          .request(operation, forward)
          .map(this.normalizeResponse(operation))
      : forward(operation)
}
