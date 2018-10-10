import { ApolloLink, execute, Observable } from 'apollo-link'
import gql from 'graphql-tag'

import { CombineIncludesLink } from 'apollo-link-combine-includes'

const queries = {
  simpleA: gql`
    query SimpleQuery {
      simpleAField
    }
  `,

  simpleB: gql`
    query SimpleQuery {
      simpleBField
    }
  `,

  includes: gql`
    query CombinedIncludesQuery($a: Boolean, $b: Boolean, $extra: String) {
      common
      includeWhenA @include(if: $a)
      includeWhenB @include(if: $b)
    }
  `
}

const requests = {
  simpleA: { query: queries.simpleA },
  simpleB: { query: queries.simpleB },
  includesWithA: { query: queries.includes, variables: { a: true } },
  includesWithB: { query: queries.includes, variables: { b: true } },
  includesWithExtraAndA: {
    query: queries.includes,
    variables: { a: true, extra: 'extra' }
  },
  includesWithExtraAndB: {
    query: queries.includes,
    variables: { b: true, extra: 'extra' }
  }
}

// Fulfil operation names.
for (let i in requests) {
  requests[i].operationName = requests[i].query.definitions.find(
    ({ kind }) => kind === 'OperationDefinition'
  ).name.value
}

// const results = {
//   simpleA: { data: { simpleA: 'simple a' } },
//   simpleB: { data: { simpleB: 'simple b' } },
//   includes: { data: { common: 'common' } },
//   includesWithA: { data: { common: 'common', includeWhenA: 'a value' } },
//   includesWithB: { data: { common: 'common', includeWhenB: 'b value' } },
//   includesWithBoth: {
//     data: {
//       common: 'common',
//       includeWhenA: 'a value',
//       includeWhenB: 'b value'
//     }
//   }
// }

describe('CombineIncludesLink', () => {
  let called

  beforeEach(() => {
    called = 0
  })

  it('passes single query forward on', async () => {
    const link = ApolloLink.from([
      new CombineIncludesLink(),
      new ApolloLink(() => {
        called += 1
        return null
      })
    ])

    execute(link, requests.simpleA)
    execute(link, requests.simpleB)
    expect(called).toBe(2)
  })

  it('does not affect different queries', () => {
    const link = ApolloLink.from([
      new CombineIncludesLink(),
      new ApolloLink(() => {
        called += 1
        return null
      })
    ])

    execute(link, requests.simpleA)
    execute(link, requests.simpleB)
    expect(called).toBe(2)
  })

  it('should combine similar queries', done => {
    const link = ApolloLink.from([
      new CombineIncludesLink({
        batchMax: 2
      }),
      new ApolloLink(operation => {
        expect(operation).toHaveProperty('variables', { a: true, b: true })
        done()
        called += 1
        return null
      })
    ])

    execute(link, requests.includesWithA).subscribe()
    execute(link, requests.includesWithB).subscribe()
    expect(called).toBe(1)
  })

  it('should not combine similar queries with differing variables', done => {
    const link = ApolloLink.from([
      new CombineIncludesLink({
        batchMax: 2
      }),
      new ApolloLink(operation => {
        called += 1

        switch (called) {
          case 1:
            expect(operation).toHaveProperty('variables', { a: true })
            break
          case 2:
            expect(operation).toHaveProperty('variables', {
              a: true,
              extra: 'extra'
            })
            break
        }

        if (called === 2) done()

        return null
      })
    ])

    execute(link, requests.includesWithA).subscribe()
    execute(link, requests.includesWithExtraAndA).subscribe()
    expect(called).toBe(2)
  })

  it('should combine similar queries grouping by matching variables', done => {
    let calledUp = 0

    const link = ApolloLink.from([
      new ApolloLink((operation, forward) =>
        forward(operation).map(data => {
          calledUp++

          const expects = {
            1: () => expect(data).toBe('result 1'),
            2: () => expect(data).toBe('result 1'),
            3: () => expect(data).toBe('result 2'),
            4: () => expect(data).toBe('result 2'),
            5: () => done('Called more then expected')
          }

          expects[calledUp]()

          if (calledUp === 4) done()

          return data
        })
      ),

      new CombineIncludesLink({
        batchMax: 4
      }),
      new ApolloLink(operation => {
        called += 1

        const expects = {
          1: () =>
            expect(operation).toHaveProperty('variables', { a: true, b: true }),
          2: () =>
            expect(operation).toHaveProperty('variables', {
              a: true,
              b: true,
              extra: 'extra'
            }),
          3: () => done('Called more then expected')
        }

        expects[called]()

        return Observable.of(`result ${called}`)
      })
    ])

    execute(link, requests.includesWithA).subscribe()
    execute(link, requests.includesWithB).subscribe()
    execute(link, requests.includesWithExtraAndA).subscribe()
    execute(link, requests.includesWithExtraAndB).subscribe()
    expect(called).toBe(2)
  })
})
