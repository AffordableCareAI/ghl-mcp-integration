/**
 * Tests for openclaw-skill/ghl_actions.js
 * Uses node:test + mock fetch.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMockFetch, MOCK_CONTACTS } from './helpers/mock-fetch.js';

let createActions;

describe('ghl_actions', () => {
  before(async () => {
    const m = createMockFetch();
    globalThis._originalFetch = globalThis.fetch;
    globalThis.fetch = m.fetch;

    // Suppress stderr logging during tests
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;

    const mod = await import('../openclaw-skill/ghl_actions.js');
    createActions = mod.createActions;

    process.stderr.write = origWrite;
  });

  after(() => {
    globalThis.fetch = globalThis._originalFetch;
  });

  describe('createActions', () => {
    it('should create actions from location config', () => {
      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      assert.ok(actions.searchContacts);
      assert.ok(actions.getContactDetails);
      assert.ok(actions.upsertContact);
      assert.ok(actions.tagContacts);
      assert.ok(actions.removeContactTags);
      assert.ok(actions.getConversationHistory);
      assert.ok(actions.sendMessage);
      assert.ok(actions.getPipelines);
      assert.ok(actions.searchOpportunities);
      assert.ok(actions.moveOpportunity);
      assert.ok(actions.getPipelineOverview);
      assert.ok(actions.close);
    });
  });

  describe('searchContacts', () => {
    it('should return contacts', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      const result = await actions.searchContacts('test');

      assert.ok(result.content);
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.contacts);
      assert.equal(parsed.contacts.length, 2);

      await actions.close();
    });
  });

  describe('tagContacts', () => {
    it('should tag a single contact', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      const results = await actions.tagContacts('c1', ['AI-Audit-Lead']);

      assert.equal(results.length, 1);
      assert.equal(results[0].contactId, 'c1');

      await actions.close();
    });

    it('should tag multiple contacts', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      const results = await actions.tagContacts(['c1', 'c2'], 'High-Value-Lead');

      assert.equal(results.length, 2);

      await actions.close();
    });
  });

  describe('getPipelineOverview', () => {
    it('should return pipeline overview with stage counts', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      const overview = await actions.getPipelineOverview('pipe1');

      assert.ok(overview.pipeline);
      assert.ok(overview.stages);
      assert.equal(overview.pipeline, 'Strategic AI Audit Pipeline');
      assert.equal(overview.totalOpportunities, 2);

      await actions.close();
    });
  });

  describe('rate limiter', () => {
    it('should track rate limiter stats', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      await actions.searchContacts('test');
      const stats = actions.rateLimiterStats;

      assert.ok(typeof stats.windowRemaining === 'number');
      assert.ok(typeof stats.dayRemaining === 'number');
      assert.ok(stats.dayCount > 0);

      await actions.close();
    });
  });
});
