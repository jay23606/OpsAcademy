/**
 * JSON file store — small persistence layer for users, progress and certificates.
 *
 * Everything lives in memory and is written to one file with an atomic
 * rename, so a crash mid-write cannot corrupt it. Every save rewrites the
 * whole file, which is fine for a demo and wasteful beyond a few thousand
 * learners: set STORE_DRIVER=sqlite to use lib/sqliteStore.js instead, which
 * has the same get/set/all interface.
 */

const fs = require('fs');
const path = require('path');

class JsonStore {
  /**
   * @param {string|null} filePath  null keeps the store in memory only (tests).
   */
  constructor(filePath = null, { debounceMs = 200 } = {}) {
    this.filePath = filePath;
    this.debounceMs = debounceMs;
    this.data = {};
    this.timer = null;
    this.dirty = false;

    if (filePath && fs.existsSync(filePath)) {
      this.data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }

  collection(name) {
    if (!this.data[name]) this.data[name] = {};
    return this.data[name];
  }

  get(name, id) {
    const doc = this.collection(name)[id];
    return doc === undefined ? null : structuredClone(doc);
  }

  set(name, id, doc) {
    this.collection(name)[id] = structuredClone(doc);
    this.schedule();
    return doc;
  }

  delete(name, id) {
    const existed = id in this.collection(name);
    delete this.collection(name)[id];
    if (existed) this.schedule();
    return existed;
  }

  all(name) {
    return Object.values(this.collection(name)).map((doc) => structuredClone(doc));
  }

  find(name, predicate) {
    return this.all(name).filter(predicate);
  }

  schedule() {
    this.dirty = true;
    if (!this.filePath || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.debounceMs);
    this.timer.unref();
  }

  /** Write pending changes to disk now. Safe to call at shutdown. */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.filePath || !this.dirty) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath);
    this.dirty = false;
  }

  /** True if the backing directory can be written (used by the readiness probe). */
  isWritable() {
    if (!this.filePath) return true;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.accessSync(path.dirname(this.filePath), fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }
}

let defaultStore = null;

/**
 * The store for this process: a JSON file by default, SQLite when
 * STORE_DRIVER=sqlite. Tests always get an in-memory JSON store.
 */
function createStore(config) {
  const jsonPath = path.join(config.dataDir, 'store.json');
  if (config.isTest) return new JsonStore(null);

  if (config.storeDriver === 'supabase') {
    const { SupabaseStore } = require('./supabaseStore');
    const store = new SupabaseStore({
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseSecretKey || config.supabaseKey,
    });
    if (fs.existsSync(jsonPath)) store.importJson(jsonPath);
    return store;
  }

  if (config.storeDriver !== 'sqlite') return new JsonStore(jsonPath);

  const { SqliteStore } = require('./sqliteStore');
  const dbPath = path.join(config.dataDir, 'store.db');
  const isNew = !fs.existsSync(dbPath);
  const store = new SqliteStore(dbPath);
  // Switching an existing deployment over keeps its accounts and progress.
  if (isNew) store.importJson(jsonPath);
  return store;
}

function getStore() {
  if (!defaultStore) defaultStore = createStore(require('../config'));
  return defaultStore;
}

/** Replace the shared store (tests). */
function setStore(store) {
  defaultStore = store;
}

module.exports = { JsonStore, createStore, getStore, setStore };
