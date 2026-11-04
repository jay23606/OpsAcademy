/**
 * Supabase Store — high-performance cloud persistence for OpsAcademy.
 *
 * Implements the same synchronous interface as JsonStore and SqliteStore
 * with an in-memory write-through cache backed by Supabase PostgreSQL.
 *
 * All reads are instant (0ms in-memory cache), and all writes are
 * immediately persisted to the Supabase `documents` table via the
 * service role key.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const logger = require('./logger');

class SupabaseStore {
  /**
   * @param {object} options
   * @param {string} options.supabaseUrl
   * @param {string} options.supabaseKey (Service role secret key)
   * @param {string} [options.importPath] legacy store.json, imported once if the table is empty
   */
  constructor({ supabaseUrl, supabaseKey, importPath = null } = {}) {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error('SupabaseStore requires SUPABASE_URL and SUPABASE_SECRET_KEY');
    }

    this.url = url;
    this.key = key;
    this.importPath = importPath;
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    this.data = {};
    this.pendingWrites = new Set();
    this.initialized = false;
    this.initError = null;

    // Start background preload
    this._initPromise = this.init();
  }

  async init() {
    try {
      const { data, error } = await this.supabase
        .from('documents')
        .select('collection, id, doc');

      if (error) {
        logger.error({ error: error.message }, '[SupabaseStore] Failed to load documents');
        this.initError = error;
        return false;
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          if (!this.data[row.collection]) this.data[row.collection] = {};
          this.data[row.collection][row.id] = row.doc;
        }
        logger.info({ count: data.length }, '[SupabaseStore] Preloaded documents from Supabase');
        if (data.length === 0 && this.importPath) await this.importOnce(this.importPath);
      }

      this.initialized = true;
      return true;
    } catch (err) {
      logger.error({ error: err.message }, '[SupabaseStore] Init error');
      this.initError = err;
      return false;
    }
  }

  collection(name) {
    if (!this.data[name]) this.data[name] = {};
    return this.data[name];
  }

  get(name, id) {
    const doc = this.collection(name)[String(id)];
    return doc === undefined ? null : structuredClone(doc);
  }

  set(name, id, doc) {
    const cloned = structuredClone(doc);
    const strId = String(id);
    this.collection(name)[strId] = cloned;

    const writePromise = this.supabase
      .from('documents')
      .upsert({
        collection: name,
        id: strId,
        doc: cloned,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) {
          logger.error({ collection: name, id: strId, err: error.message }, '[SupabaseStore] Upsert failed');
        }
      })
      .catch((err) => {
        logger.error({ collection: name, id: strId, err: err.message }, '[SupabaseStore] Network error on upsert');
      })
      .finally(() => {
        this.pendingWrites.delete(writePromise);
      });

    this.pendingWrites.add(writePromise);

    // If setting a user or profile, also update public.profiles table for convenience
    if (name === 'users' && doc.id) {
      this.syncProfile(doc);
    }

    return doc;
  }

  syncProfile(user) {
    this.supabase
      .from('profiles')
      .upsert({
        id: String(user.id),
        name: user.name || null,
        email: user.email || null,
        guest: Boolean(user.guest),
        profile_slug: user.profileSlug || null,
        updated_at: new Date().toISOString(),
      })
      .catch((err) => {
        logger.warn({ err: err.message }, '[SupabaseStore] Profile sync notice');
      });
  }

  delete(name, id) {
    const strId = String(id);
    const existed = strId in this.collection(name);
    delete this.collection(name)[strId];

    if (existed) {
      const deletePromise = this.supabase
        .from('documents')
        .delete()
        .match({ collection: name, id: strId })
        .then(({ error }) => {
          if (error) {
            logger.error({ collection: name, id: strId, err: error.message }, '[SupabaseStore] Delete failed');
          }
        })
        .catch((err) => {
          logger.error({ collection: name, id: strId, err: err.message }, '[SupabaseStore] Network error on delete');
        })
        .finally(() => {
          this.pendingWrites.delete(deletePromise);
        });

      this.pendingWrites.add(deletePromise);
    }

    return existed;
  }

  all(name) {
    return Object.values(this.collection(name)).map((doc) => structuredClone(doc));
  }

  find(name, predicate) {
    return this.all(name).filter(predicate);
  }

  async flush() {
    if (this.pendingWrites.size > 0) {
      await Promise.allSettled(Array.from(this.pendingWrites));
    }
  }

  isWritable() {
    return !this.initError;
  }

  /**
   * Import store.json into an empty documents table, once. The file is renamed
   * to store.json.importing first, so no later boot reads it as the trigger
   * again. On success it becomes store.json.imported. On failure it is renamed
   * back and the store reports an init error, so the next start retries.
   * If the process dies mid-import, store.json.importing is left behind; the
   * next start imports from it again, since the upsert is idempotent.
   */
  async importOnce(filePath) {
    const claimed = `${filePath}.importing`;
    if (!fs.existsSync(claimed)) {
      if (!fs.existsSync(filePath)) return;
      try {
        fs.renameSync(filePath, claimed);
      } catch (err) {
        logger.error({ err: err.message }, '[SupabaseStore] Could not claim store.json; not imported');
        return;
      }
    } else {
      logger.warn({ claimed }, '[SupabaseStore] Resuming a one-time import that did not finish');
    }

    let imported;
    try {
      imported = await this.importJson(claimed);
    } catch (err) {
      logger.error({ err: err.message }, '[SupabaseStore] One-time import failed; store.json restored for the next start');
      this.initError = err;
      try {
        fs.renameSync(claimed, filePath);
      } catch (restoreErr) {
        logger.error({ err: restoreErr.message, claimed }, '[SupabaseStore] Could not restore store.json; rename it back by hand');
      }
      return;
    }

    try {
      fs.renameSync(claimed, `${filePath}.imported`);
      logger.info({ imported, filePath }, '[SupabaseStore] One-time import complete');
    } catch (err) {
      logger.error({ err: err.message, claimed }, '[SupabaseStore] Imported, but could not rename the file; it is not read again');
    }
  }

  /**
   * Import existing records from a store.json path or an object. Throws if the
   * file cannot be read or parsed, or if the upsert fails; nothing is cached then.
   */
  async importJson(source) {
    let payload = null;
    if (typeof source === 'string' && fs.existsSync(source)) {
      payload = JSON.parse(fs.readFileSync(source, 'utf8'));
    } else if (typeof source === 'object') {
      payload = source;
    }

    if (!payload) return 0;

    const rows = [];
    for (const [col, items] of Object.entries(payload)) {
      if (typeof items === 'object' && items !== null) {
        for (const [id, doc] of Object.entries(items)) {
          rows.push({
            collection: col,
            id: String(id),
            doc,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    // A single upsert is one statement, so the import lands completely or not at all.
    if (rows.length > 0) {
      const { error } = await this.supabase.from('documents').upsert(rows);
      if (error) throw new Error(error.message);
      logger.info({ imported: rows.length }, '[SupabaseStore] Imported records to Supabase');
    }

    for (const row of rows) {
      this.collection(row.collection)[row.id] = structuredClone(row.doc);
    }
    return rows.length;
  }
}

module.exports = { SupabaseStore };
