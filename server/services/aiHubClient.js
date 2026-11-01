/**
 * AI Hub client — calls the Python AI hub with a timeout and a circuit breaker
 *
 * When the hub fails repeatedly the breaker opens and calls fail fast for a
 * while, so a dead hub adds no latency to the routes that fall back.
 */

const { StringDecoder } = require('string_decoder');
const axios = require('axios');
const config = require('../config');
const logger = require('../lib/logger');
const metrics = require('../lib/metrics');

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30000;
const RETRYABLE_CODES = new Set(['ECONNRESET', 'EPIPE']);
// A streamed hint may pause between events while the model thinks.
const STREAM_IDLE_FACTOR = 4;

class HubUnavailableError extends Error {}

function createClient({ baseUrl = config.aiHubUrl, token = config.aiHubToken, timeoutMs = config.aiHubTimeoutMs, http = axios } = {}) {
  const breakers = new Map();
  function getBreaker(endpoint) {
    let key = 'default';
    if (endpoint.includes('hint')) key = 'hint';
    else if (endpoint.includes('scan')) key = 'scan';
    else if (endpoint.includes('interview')) key = 'interview';

    if (!breakers.has(key)) {
      breakers.set(key, { failures: 0, openUntil: 0 });
    }
    return breakers.get(key);
  }

  async function post(endpoint, body) {
    const breaker = getBreaker(endpoint);
    if (Date.now() < breaker.openUntil) {
      metrics.aiHubDuration.observe({ endpoint, outcome: 'circuit_open' }, 0);
      throw new HubUnavailableError('AI hub circuit open');
    }

    const end = metrics.aiHubDuration.startTimer({ endpoint });
    const send = () => http.post(`${baseUrl}${endpoint}`, body, {
      timeout: timeoutMs,
      headers: token ? { 'x-internal-token': token } : {},
    });
    try {
      let response;
      try {
        response = await send();
      } catch (err) {
        // A kept-alive socket the hub had already closed fails instantly with
        // a reset. Hub calls have no side effects, so try once more on a new one.
        if (!RETRYABLE_CODES.has(err.code)) throw err;
        response = await send();
      }
      breaker.failures = 0;
      end({ outcome: 'ok' });
      return response.data.data;
    } catch (err) {
      end({ outcome: 'error' });
      breaker.failures += 1;
      if (breaker.failures >= FAILURE_THRESHOLD) {
        breaker.openUntil = Date.now() + OPEN_MS;
        breaker.failures = 0;
        logger.warn({ endpoint }, '[AI Hub] circuit opened after repeated failures');
      }
      throw new HubUnavailableError(err.message);
    }
  }

  /**
   * Ask for a hint and receive it as events while it is written
   * ({type: 'delta' | 'reset' | 'done' | 'error'}). Throws HubUnavailableError
   * if the hub cannot be reached, goes quiet, or ends without a 'done' event.
   */
  async function* hintStream(payload, { signal } = {}) {
    const endpoint = '/api/agent/hint/stream';
    const breaker = getBreaker(endpoint);
    if (Date.now() < breaker.openUntil) {
      metrics.aiHubDuration.observe({ endpoint, outcome: 'circuit_open' }, 0);
      throw new HubUnavailableError('AI hub circuit open');
    }

    const end = metrics.aiHubDuration.startTimer({ endpoint });
    const fail = (message) => {
      end({ outcome: 'error' });
      breaker.failures += 1;
      if (breaker.failures >= FAILURE_THRESHOLD) {
        breaker.openUntil = Date.now() + OPEN_MS;
        breaker.failures = 0;
        logger.warn({ endpoint }, '[AI Hub] circuit opened after repeated failures');
      }
      return new HubUnavailableError(message);
    };

    let response;
    try {
      // The timeout covers the wait for the first byte; after that each
      // event has its own deadline below.
      response = await http.post(`${baseUrl}${endpoint}`, payload, {
        timeout: timeoutMs,
        responseType: 'stream',
        signal,
        headers: token ? { 'x-internal-token': token } : {},
      });
    } catch (err) {
      throw fail(err.message);
    }

    const stream = response.data;
    let idle = null;
    const watchdog = () => {
      clearTimeout(idle);
      idle = setTimeout(() => stream.destroy(new Error('AI hub stream went quiet')), timeoutMs * STREAM_IDLE_FACTOR);
    };

    let finished = false;
    let buffer = '';
    // A chunk can end in the middle of a multi-byte character.
    const decoder = new StringDecoder('utf8');
    try {
      watchdog();
      for await (const chunk of stream) {
        watchdog();
        buffer += decoder.write(chunk);
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === 'error') throw new Error('AI hub reported an error');
          if (event.type === 'done') finished = true;
          yield event;
        }
      }
    } catch (err) {
      throw fail(err.message);
    } finally {
      clearTimeout(idle);
      // The caller stopped early (the browser went away): stop the hub's work too.
      if (!stream.destroyed) stream.destroy();
    }

    if (!finished) throw fail('AI hub stream ended early');
    breaker.failures = 0;
    end({ outcome: 'ok' });
  }

  async function isHealthy() {
    try {
      await http.get(`${baseUrl}/health`, { timeout: Math.min(timeoutMs, 1500) });
      return true;
    } catch {
      return false;
    }
  }

  return {
    hint: (payload) => post('/api/agent/hint', payload),
    hintStream,
    scan: (command) => post('/api/agent/scan', { command }),
    scoreInterview: (payload) => post('/api/agent/interview/score', payload),
    isHealthy,
  };
}

let defaultClient = null;

function getHubClient() {
  if (!defaultClient) defaultClient = createClient();
  return defaultClient;
}

/** Replace the shared client (tests). */
function setHubClient(client) {
  defaultClient = client;
}

module.exports = { createClient, getHubClient, setHubClient, HubUnavailableError };
