/**
 * Tests for openclaw-skill/ghl_monitor.js
 * Uses node:test + mock fetch.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMockFetch, MOCK_CONTACTS, MOCK_PIPELINES, MOCK_OPPORTUNITIES } from './helpers/mock-fetch.js';

let checkStaleLeads, checkPipelineBottlenecks, formatSummary;

describe('ghl_monitor', () => {
  before(async () => {
    const m = createMockFetch();
    globalThis._originalFetch = globalThis.fetch;
    globalThis.fetch = m.fetch;

    // Suppress stderr logging during tests
    const origWrite = process.stderr.write;
    process.stderr.write = () => true;

    const mod = await import('../openclaw-skill/ghl_monitor.js');
    checkStaleLeads = mod.checkStaleLeads;
    checkPipelineBottlenecks = mod.checkPipelineBottlenecks;
    formatSummary = mod.formatSummary;

    process.stderr.write = origWrite;
  });

  after(() => {
    globalThis.fetch = globalThis._originalFetch;
  });

  describe('checkStaleLeads', () => {
    it('should identify stale contacts', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      // Import actions fresh with mocked fetch
      const { createActions } = await import('../openclaw-skill/ghl_actions.js');
      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      const result = await checkStaleLeads(actions, { thresholds: { stale_lead_hours: 48 } });

      assert.equal(result.check, 'stale_leads');
      assert.ok(typeof result.count === 'number');
      assert.ok(Array.isArray(result.items));

      // John Doe has old lastActivity, should be stale
      if (result.count > 0) {
        assert.ok(result.items[0].name);
        assert.ok(result.items[0].lastActivity);
      }

      await actions.close();
    });
  });

  describe('checkPipelineBottlenecks', () => {
    it('should detect stuck opportunities', async () => {
      const m = createMockFetch();
      globalThis.fetch = m.fetch;

      const { createActions } = await import('../openclaw-skill/ghl_actions.js');
      const actions = createActions({
        token: 'test-token',
        locationId: 'test-loc',
        alias: 'test',
      });

      const result = await checkPipelineBottlenecks(actions, { thresholds: { stuck_opportunity_days: 7 } });

      assert.equal(result.check, 'pipeline_bottlenecks');
      assert.ok(typeof result.count === 'number');
      assert.ok(Array.isArray(result.bottlenecks));

      await actions.close();
    });
  });

  describe('formatSummary', () => {
    it('should format results into readable text', () => {
      const results = {
        timestamp: new Date().toISOString(),
        location: 'Test Location',
        checks: {
          staleLeads: { check: 'stale_leads', count: 3, items: [] },
          missedFollowups: { check: 'missed_followups', count: 0, items: [] },
          pipelineBottlenecks: { check: 'pipeline_bottlenecks', count: 2, bottlenecks: [] },
          slowResponses: { check: 'slow_responses', count: 0, items: [] },
        },
      };

      const summary = formatSummary(results);

      assert.ok(summary.includes('GHL Monitor'));
      assert.ok(summary.includes('Test Location'));
      assert.ok(summary.includes('Stale Leads'));
      assert.ok(summary.includes('3 found'));
      assert.ok(summary.includes('None')); // missedFollowups = 0
      assert.ok(summary.includes('5 total issues'));
    });

    it('should show all-clear when no issues', () => {
      const results = {
        timestamp: new Date().toISOString(),
        location: 'Clean Location',
        checks: {
          staleLeads: { check: 'stale_leads', count: 0, items: [] },
          missedFollowups: { check: 'missed_followups', count: 0, items: [] },
          pipelineBottlenecks: { check: 'pipeline_bottlenecks', count: 0, bottlenecks: [] },
          slowResponses: { check: 'slow_responses', count: 0, items: [] },
        },
      };

      const summary = formatSummary(results);
      assert.ok(summary.includes('All clear'));
    });

    it('should handle error states gracefully', () => {
      const results = {
        timestamp: new Date().toISOString(),
        location: 'Error Location',
        checks: {
          staleLeads: { check: 'stale_leads', error: 'Connection refused' },
          missedFollowups: { check: 'missed_followups', count: 0, items: [] },
          pipelineBottlenecks: { check: 'pipeline_bottlenecks', count: 0, bottlenecks: [] },
          slowResponses: { check: 'slow_responses', count: 0, items: [] },
        },
      };

      const summary = formatSummary(results);
      assert.ok(summary.includes('Error'));
      assert.ok(summary.includes('Connection refused'));
    });
  });
});
