/**
 * Tests for workflow-protocol and agent-protocol catalog types
 * @module tests/catalog/workflow-agent-types.test
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { URNCatalogIndex } from '../../packages/protocols/src/catalog/index.js';
import { catalogIndexSchema } from '../../packages/protocols/src/catalog/schema.js';

describe('Workflow and Agent Protocol Types', () => {
  let catalog;

  const workflowArtifact = {
    urn: 'urn:protocol:workflow:order.fulfillment:1.0.0',
    name: 'order.fulfillment',
    version: '1.0.0',
    namespace: 'urn:protocol:workflow',
    type: 'workflow-protocol',
    manifest: 'https://example.com/order.fulfillment/manifest.json',
    dependencies: ['urn:protocol:event:order.placed:1.0.0'],
    metadata: {
      tags: ['orchestration', 'orders'],
      governance: {
        classification: 'internal',
        owner: 'platform-team',
        pii: false
      }
    }
  };

  const agentArtifact = {
    urn: 'urn:protocol:agent:billing.agent:1.0.0',
    name: 'billing.agent',
    version: '1.0.0',
    namespace: 'urn:protocol:agent',
    type: 'agent-protocol',
    manifest: 'https://example.com/billing.agent/manifest.json',
    dependencies: ['urn:protocol:api:billing.service:1.0.0'],
    metadata: {
      tags: ['a2a', 'billing'],
      governance: {
        classification: 'confidential',
        owner: 'billing-team',
        pii: true,
        compliance: ['pci-dss']
      }
    }
  };

  beforeEach(() => {
    catalog = new URNCatalogIndex();
  });

  describe('Schema Validation', () => {
    it('should include workflow-protocol in ProtocolType enum', () => {
      const typeEnum = catalogIndexSchema
        .properties.artifacts.patternProperties[Object.keys(catalogIndexSchema.properties.artifacts.patternProperties)[0]]
        .properties.type.enum;
      expect(typeEnum).toContain('workflow-protocol');
    });

    it('should include agent-protocol in ProtocolType enum', () => {
      const typeEnum = catalogIndexSchema
        .properties.artifacts.patternProperties[Object.keys(catalogIndexSchema.properties.artifacts.patternProperties)[0]]
        .properties.type.enum;
      expect(typeEnum).toContain('agent-protocol');
    });

    it('should have 6 protocol types total', () => {
      const typeEnum = catalogIndexSchema
        .properties.artifacts.patternProperties[Object.keys(catalogIndexSchema.properties.artifacts.patternProperties)[0]]
        .properties.type.enum;
      expect(typeEnum).toHaveLength(6);
      expect(typeEnum).toEqual(expect.arrayContaining([
        'event-protocol',
        'data-protocol',
        'api-protocol',
        'ui-protocol',
        'workflow-protocol',
        'agent-protocol'
      ]));
    });

    it('should accept workflow URN pattern in schema', () => {
      const urnPattern = Object.keys(catalogIndexSchema.properties.artifacts.patternProperties)[0];
      const regex = new RegExp(urnPattern);
      expect(regex.test('urn:protocol:workflow:order.fulfillment:1.0.0')).toBe(true);
    });

    it('should accept agent URN pattern in schema', () => {
      const urnPattern = Object.keys(catalogIndexSchema.properties.artifacts.patternProperties)[0];
      const regex = new RegExp(urnPattern);
      expect(regex.test('urn:protocol:agent:billing.agent:1.0.0')).toBe(true);
    });
  });

  describe('Catalog Operations - Workflow', () => {
    it('should add workflow-protocol artifact', () => {
      catalog.add(workflowArtifact);

      expect(catalog.size()).toBe(1);
      expect(catalog.has(workflowArtifact.urn)).toBe(true);
    });

    it('should retrieve workflow artifact by URN', () => {
      catalog.add(workflowArtifact);

      const retrieved = catalog.get(workflowArtifact.urn);
      expect(retrieved).toEqual(workflowArtifact);
      expect(retrieved.type).toBe('workflow-protocol');
    });

    it('should find workflow artifacts by type', () => {
      catalog.add(workflowArtifact);

      const result = catalog.findByType('workflow-protocol');
      expect(result.count).toBe(1);
      expect(result.results[0].type).toBe('workflow-protocol');
    });

    it('should find workflow artifacts by namespace', () => {
      catalog.add(workflowArtifact);

      const result = catalog.findByNamespace('urn:protocol:workflow');
      expect(result.count).toBe(1);
    });

    it('should remove workflow artifact', () => {
      catalog.add(workflowArtifact);
      const removed = catalog.remove(workflowArtifact.urn);

      expect(removed).toBe(true);
      expect(catalog.size()).toBe(0);
    });
  });

  describe('Catalog Operations - Agent', () => {
    it('should add agent-protocol artifact', () => {
      catalog.add(agentArtifact);

      expect(catalog.size()).toBe(1);
      expect(catalog.has(agentArtifact.urn)).toBe(true);
    });

    it('should retrieve agent artifact by URN', () => {
      catalog.add(agentArtifact);

      const retrieved = catalog.get(agentArtifact.urn);
      expect(retrieved).toEqual(agentArtifact);
      expect(retrieved.type).toBe('agent-protocol');
    });

    it('should find agent artifacts by type', () => {
      catalog.add(agentArtifact);

      const result = catalog.findByType('agent-protocol');
      expect(result.count).toBe(1);
      expect(result.results[0].type).toBe('agent-protocol');
    });

    it('should find agent artifacts by namespace', () => {
      catalog.add(agentArtifact);

      const result = catalog.findByNamespace('urn:protocol:agent');
      expect(result.count).toBe(1);
    });

    it('should find agent artifacts with PII', () => {
      catalog.add(agentArtifact);

      const result = catalog.findByPII(true);
      expect(result.count).toBe(1);
      expect(result.results[0].urn).toBe(agentArtifact.urn);
    });

    it('should find agent artifacts by compliance tag', () => {
      catalog.add(agentArtifact);

      const result = catalog.findByGovernance({
        pii: true,
        compliance: ['pci-dss']
      });
      expect(result.count).toBe(1);
    });
  });

  describe('Cross-Type Dependencies', () => {
    it('should track workflow depending on event', () => {
      const eventArtifact = {
        urn: 'urn:protocol:event:order.placed:1.0.0',
        name: 'order.placed',
        version: '1.0.0',
        namespace: 'urn:protocol:event',
        type: 'event-protocol',
        manifest: 'https://example.com/order.placed/manifest.json',
        dependencies: [],
        metadata: {
          tags: ['orders'],
          governance: { classification: 'internal', owner: 'platform-team', pii: false }
        }
      };

      catalog.add(eventArtifact);
      catalog.add(workflowArtifact);

      const tree = catalog.getDependencyTree(workflowArtifact.urn);
      expect(tree.size).toBe(2);
      expect(tree.has(eventArtifact.urn)).toBe(true);
    });

    it('should track agent depending on api', () => {
      const apiArtifact = {
        urn: 'urn:protocol:api:billing.service:1.0.0',
        name: 'billing.service',
        version: '1.0.0',
        namespace: 'urn:protocol:api',
        type: 'api-protocol',
        manifest: 'https://example.com/billing.service/manifest.json',
        dependencies: [],
        metadata: {
          tags: ['billing'],
          governance: { classification: 'internal', owner: 'billing-team', pii: false }
        }
      };

      catalog.add(apiArtifact);
      catalog.add(agentArtifact);

      const tree = catalog.getDependencyTree(agentArtifact.urn);
      expect(tree.size).toBe(2);
      expect(tree.has(apiArtifact.urn)).toBe(true);
    });

    it('should compute build order across all 6 protocol types', () => {
      const artifacts = [
        {
          urn: 'urn:protocol:data:user:1.0.0', name: 'user', version: '1.0.0',
          namespace: 'urn:protocol:data', type: 'data-protocol',
          manifest: 'https://example.com/user/manifest.json', dependencies: [],
          metadata: { tags: [], governance: { classification: 'internal', owner: 'team', pii: false } }
        },
        {
          urn: 'urn:protocol:event:user.created:1.0.0', name: 'user.created', version: '1.0.0',
          namespace: 'urn:protocol:event', type: 'event-protocol',
          manifest: 'https://example.com/user.created/manifest.json',
          dependencies: ['urn:protocol:data:user:1.0.0'],
          metadata: { tags: [], governance: { classification: 'internal', owner: 'team', pii: false } }
        },
        {
          urn: 'urn:protocol:api:user.api:1.0.0', name: 'user.api', version: '1.0.0',
          namespace: 'urn:protocol:api', type: 'api-protocol',
          manifest: 'https://example.com/user.api/manifest.json',
          dependencies: ['urn:protocol:data:user:1.0.0'],
          metadata: { tags: [], governance: { classification: 'internal', owner: 'team', pii: false } }
        },
        {
          urn: 'urn:protocol:workflow:onboarding:1.0.0', name: 'onboarding', version: '1.0.0',
          namespace: 'urn:protocol:workflow', type: 'workflow-protocol',
          manifest: 'https://example.com/onboarding/manifest.json',
          dependencies: ['urn:protocol:event:user.created:1.0.0', 'urn:protocol:api:user.api:1.0.0'],
          metadata: { tags: [], governance: { classification: 'internal', owner: 'team', pii: false } }
        },
        {
          urn: 'urn:protocol:agent:onboarding.agent:1.0.0', name: 'onboarding.agent', version: '1.0.0',
          namespace: 'urn:protocol:agent', type: 'agent-protocol',
          manifest: 'https://example.com/onboarding.agent/manifest.json',
          dependencies: ['urn:protocol:workflow:onboarding:1.0.0'],
          metadata: { tags: [], governance: { classification: 'internal', owner: 'team', pii: false } }
        }
      ];

      artifacts.forEach(a => catalog.add(a));

      const order = catalog.getBuildOrder('urn:protocol:agent:onboarding.agent:1.0.0');
      expect(order.length).toBe(5);

      // data must come before event, api, workflow, and agent
      const dataIdx = order.indexOf('urn:protocol:data:user:1.0.0');
      const agentIdx = order.indexOf('urn:protocol:agent:onboarding.agent:1.0.0');
      expect(dataIdx).toBeLessThan(agentIdx);
      expect(order[order.length - 1]).toBe('urn:protocol:agent:onboarding.agent:1.0.0');
    });
  });

  describe('Statistics with All 6 Types', () => {
    it('should report stats across all protocol types', () => {
      const types = [
        { urn: 'urn:protocol:event:e:1.0.0', type: 'event-protocol', ns: 'event' },
        { urn: 'urn:protocol:data:d:1.0.0', type: 'data-protocol', ns: 'data' },
        { urn: 'urn:protocol:api:a:1.0.0', type: 'api-protocol', ns: 'api' },
        { urn: 'urn:protocol:ui:u:1.0.0', type: 'ui-protocol', ns: 'ui' },
        { urn: 'urn:protocol:workflow:w:1.0.0', type: 'workflow-protocol', ns: 'workflow' },
        { urn: 'urn:protocol:agent:g:1.0.0', type: 'agent-protocol', ns: 'agent' }
      ];

      types.forEach(({ urn, type, ns }) => {
        catalog.add({
          urn, name: ns, version: '1.0.0',
          namespace: `urn:protocol:${ns}`, type,
          manifest: `https://example.com/${ns}/manifest.json`,
          dependencies: [],
          metadata: {
            tags: ['test'],
            governance: { classification: 'internal', owner: 'team', pii: false }
          }
        });
      });

      const stats = catalog.getStats();
      expect(stats.totalArtifacts).toBe(6);
      expect(stats.byType['event-protocol']).toBe(1);
      expect(stats.byType['data-protocol']).toBe(1);
      expect(stats.byType['api-protocol']).toBe(1);
      expect(stats.byType['ui-protocol']).toBe(1);
      expect(stats.byType['workflow-protocol']).toBe(1);
      expect(stats.byType['agent-protocol']).toBe(1);
    });
  });

  describe('Persistence with New Types', () => {
    it('should serialize and deserialize workflow/agent artifacts', () => {
      catalog.add(workflowArtifact);
      catalog.add(agentArtifact);

      const json = catalog.toJSON();
      const newCatalog = new URNCatalogIndex();
      newCatalog.fromJSON(json);

      expect(newCatalog.size()).toBe(2);
      expect(newCatalog.get(workflowArtifact.urn)).toEqual(workflowArtifact);
      expect(newCatalog.get(agentArtifact.urn)).toEqual(agentArtifact);

      const workflowResult = newCatalog.findByType('workflow-protocol');
      expect(workflowResult.count).toBe(1);

      const agentResult = newCatalog.findByType('agent-protocol');
      expect(agentResult.count).toBe(1);
    });
  });
});
