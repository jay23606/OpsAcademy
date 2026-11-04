const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../lib/store');

// The cloud table is the source of truth: a restart must never upsert the
// local store.json over it.
let mockRows = [];
const mockUpsert = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: async () => ({ data: mockRows, error: null }),
      upsert: mockUpsert,
    }),
  }),
}));

const makeStore = (dir) =>
  createStore({
    isTest: false,
    dataDir: dir,
    storeDriver: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    supabaseSecretKey: 'test-key',
  });

beforeEach(() => {
  mockUpsert.mockClear();
});

test('an empty cloud table is seeded once from store.json, which is then renamed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-import-'));
  fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ progress: { u1: { xp: 10 } } }));
  mockRows = [];

  const store = makeStore(dir);
  await store._initPromise;

  expect(mockUpsert).toHaveBeenCalledTimes(1);
  expect(store.get('progress', 'u1')).toEqual({ xp: 10 });
  expect(fs.existsSync(path.join(dir, 'store.json'))).toBe(false);
  expect(fs.existsSync(path.join(dir, 'store.json.imported'))).toBe(true);
});

test('a failed import keeps store.json for the next start and caches nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-import-'));
  fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ progress: { u1: { xp: 10 } } }));
  mockRows = [];
  mockUpsert.mockResolvedValueOnce({ error: { message: 'upsert failed' } });

  const store = makeStore(dir);
  await store._initPromise;

  expect(fs.existsSync(path.join(dir, 'store.json'))).toBe(true);
  expect(fs.existsSync(path.join(dir, 'store.json.imported'))).toBe(false);
  expect(fs.existsSync(path.join(dir, 'store.json.importing'))).toBe(false);
  expect(store.get('progress', 'u1')).toBeNull();
  expect(store.isWritable()).toBe(false);
});

test('a fresh database without store.json starts empty and does not write', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-import-'));
  mockRows = [];

  const store = makeStore(dir);
  await store._initPromise;

  expect(mockUpsert).not.toHaveBeenCalled();
  expect(store.isWritable()).toBe(true);
});

test('restarting with a non-empty cloud table never re-imports store.json', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-import-'));
  fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ progress: { u1: { xp: 10 } } }));
  mockRows = [{ collection: 'progress', id: 'u1', doc: { xp: 150 } }];

  const store = createStore({
    isTest: false,
    dataDir: dir,
    storeDriver: 'supabase',
    supabaseUrl: 'https://example.supabase.co',
    supabaseSecretKey: 'test-key',
  });
  await store._initPromise;

  expect(mockUpsert).not.toHaveBeenCalled();
  expect(store.get('progress', 'u1')).toEqual({ xp: 150 });
  expect(fs.existsSync(path.join(dir, 'store.json'))).toBe(true);
});

test('a store.json left mid-import by a crash is retried on the next start', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-import-'));
  fs.writeFileSync(path.join(dir, 'store.json.importing'), JSON.stringify({ progress: { u1: { xp: 10 } } }));
  mockRows = [];

  const store = makeStore(dir);
  await store._initPromise;

  expect(mockUpsert).toHaveBeenCalledTimes(1);
  expect(store.get('progress', 'u1')).toEqual({ xp: 10 });
  expect(store.isWritable()).toBe(true);
  expect(fs.existsSync(path.join(dir, 'store.json.importing'))).toBe(false);
  expect(fs.existsSync(path.join(dir, 'store.json.imported'))).toBe(true);
});
