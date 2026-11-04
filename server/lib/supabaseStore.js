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

const PAGE_SIZE = 1000;

class SupabaseStore {
  /**
   * @param {object} options
   * @param {string} options.supabaseUrl
   * @param {string} options.supabaseKey (Service role secret key)
   */
  constructor({ supabaseUrl, supabaseKey } = {}) {
    const url = supabaseUrl || process.env.SUPABASE_URL;
    const key = supabaseKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_KEY;

    if (!url || !key) {
      throw new Error('SupabaseStore requires SUPABASE_URL and SUPABASE_SECRET_KEY');
    }

    this.url = url;
    this.key = key;
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
      // Supabase caps each response at a server-side row limit that can be below PAGE_SIZE,
      // so advance by the rows actually returned and stop only on an empty page.
      const rows = [];
      let tableCount = null;
      let from = 0;
      for (;;) {
        const { data, error, count } = await this.supabase
          .from('documents')
          .select('collection, id, doc', from === 0 ? { count: 'exact' } : undefined)
          .order('collection', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          logger.error({ error: error.message }, '[SupabaseStore] Failed to load documents');
          this.initError = error;
          return false;
        }

        if (from === 0) tableCount = count ?? null;
        const page = Array.isArray(data) ? data : [];
        if (page.length === 0) break;
        rows.push(...page);
        from += page.length;
      }

      for (const row of rows) {
        if (!this.data[row.collection]) this.data[row.collection] = {};
        this.data[row.collection][row.id] = row.doc;
      }
      logger.info({ count: rows.length, tableCount }, '[SupabaseStore] Preloaded documents from Supabase');
      // The table is live, so a write or delete between pages can legitimately change the count.
      if (tableCount !== null && tableCount !== rows.length) {
        logger.warn({ count: rows.length, tableCount }, '[SupabaseStore] Loaded row count differs from table count');
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

  /** Import existing records from store.json or an object */
  async importJson(source) {
    let payload = null;
    if (typeof source === 'string' && fs.existsSync(source)) {
      try {
        payload = JSON.parse(fs.readFileSync(source, 'utf8'));
      } catch (err) {
        logger.warn({ err: err.message }, '[SupabaseStore] Could not read import file');
        return 0;
      }
    } else if (typeof source === 'object') {
      payload = source;
    }

    if (!payload) return 0;

    let imported = 0;
    const rows = [];
    for (const [col, items] of Object.entries(payload)) {
      if (typeof items === 'object' && items !== null) {
        for (const [id, doc] of Object.entries(items)) {
          this.collection(col)[id] = structuredClone(doc);
          rows.push({
            collection: col,
            id: String(id),
            doc,
            updated_at: new Date().toISOString(),
          });
          imported += 1;
        }
      }
    }

    if (rows.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await this.supabase.from('documents').upsert(batch);
      }
      logger.info({ imported }, '[SupabaseStore] Imported records to Supabase');
    }

    return imported;
  }
}

module.exports = { SupabaseStore };
