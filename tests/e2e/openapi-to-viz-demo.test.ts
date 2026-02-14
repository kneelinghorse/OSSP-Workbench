import fs from 'fs-extra';
import os from 'os';
import path from 'path';

import { runOpenApiToVizDemo } from '../../examples/demos/openapi-to-viz/run-demo.js';

describe('OpenAPI to visualization demo', () => {
  test('generates graph, Cytoscape JSON, and DrawIO XML in one run', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openapi-viz-demo-'));

    try {
      const outputDir = path.join(tmpRoot, 'output');
      const specPath = path.join(process.cwd(), 'examples', 'demos', 'openapi-to-viz', 'sample-spec.json');

      const result = await runOpenApiToVizDemo({
        specPath,
        outputDir,
        quiet: true
      });

      expect(result.durationMs).toBeLessThan(5000);
      expect(await fs.pathExists(result.serviceManifestPath)).toBe(true);
      expect(await fs.pathExists(result.graphPath)).toBe(true);
      expect(await fs.pathExists(result.cytoscapePath)).toBe(true);
      expect(await fs.pathExists(result.drawioPath)).toBe(true);

      const graph = await fs.readJson(result.graphPath);
      const apiNode = graph.nodes.find((node: any) => String(node.urn || '').startsWith('urn:proto:api:'));
      const schemaNodes = graph.nodes.filter((node: any) => String(node.urn || '').startsWith('urn:proto:data:'));

      expect(apiNode).toBeTruthy();
      expect(schemaNodes.length).toBeGreaterThanOrEqual(6);

      const serviceDependencyEdges = graph.edges.filter(
        (edge: any) => edge.type === 'dependencies' && edge.source === apiNode.id
      );
      expect(serviceDependencyEdges.length).toBeGreaterThanOrEqual(2);

      const schemaDependencyEdges = graph.edges.filter((edge: any) => {
        if (edge.type !== 'dependencies') {
          return false;
        }
        return schemaNodes.some((node: any) => node.id === edge.source);
      });
      expect(schemaDependencyEdges.length).toBeGreaterThan(0);

      const cytoscape = await fs.readJson(result.cytoscapePath);
      expect(cytoscape.format).toBe('cytoscape-v1');
      expect(cytoscape.elements.nodes.some((node: any) => Boolean(node?.data?.urn))).toBe(true);

      const drawioXml = await fs.readFile(result.drawioPath, 'utf8');
      expect(drawioXml).toContain('<mxfile');
      expect(drawioXml).toContain('Order Schema');
    } finally {
      await fs.remove(tmpRoot);
    }
  });
});
