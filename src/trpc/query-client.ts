import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'
import superjson from 'superjson'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        // Ask even when the browser says it is offline: the service worker answers from what it
        // saved. The default, 'online', never sends the request at all while offline, so a saved
        // answer could not be used and the screen waited on a skeleton.
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Fail at once without a network rather than wait for one: creating an expense offline
        // goes to the outbox (see `@/lib/outbox`), which needs to know it did not get through.
        networkMode: 'always',
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  })
}
