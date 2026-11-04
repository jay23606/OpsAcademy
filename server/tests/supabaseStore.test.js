// Stands in for the documents table: every response is capped at a server row
// limit below PAGE_SIZE, so the loader must not assume full pages.
const SERVER_ROW_CAP = 500;
const mockRows = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const query = { from: 0, to: Infinity };
        const builder = {
          order: () => builder,
          range: (from, to) => {
            query.from = from;
            query.to = to;
            return builder;
          },
          then: (resolve, reject) => {
            const last = Math.min(query.to, query.from + SERVER_ROW_CAP - 1, mockRows.length - 1);
            const data = mockRows.slice(query.from, last + 1);
            return Promise.resolve({ data, error: null, count: mockRows.length }).then(resolve, reject);
          },
        };
        return builder;
      },
    }),
  }),
}));

const { SupabaseStore } = require('../lib/supabaseStore');

describe('SupabaseStore preload', () => {
  test('loads every row when the table is larger than the server row cap', async () => {
    mockRows.length = 0;
    for (let i = 0; i < 2500; i += 1) {
      mockRows.push({ collection: 'users', id: String(i).padStart(4, '0'), doc: { id: i } });
    }

    const store = new SupabaseStore({ supabaseUrl: 'http://localhost', supabaseKey: 'test' });
    await store._initPromise;

    expect(store.initialized).toBe(true);
    expect(Object.keys(store.collection('users'))).toHaveLength(2500);
  });
});
