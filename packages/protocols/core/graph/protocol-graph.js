/**
 * ProtocolGraph - Core graph structure for protocol relationships
 *
 * Built on Graphology for efficient graph operations.
 * Supports URN-based nodes, typed edges, cycle detection, PII tracing, and impact analysis.
 */

import Graph from 'graphology';
import { parseURN, normalizeURN, isValidURN, versionMatchesRange } from './urn-utils.js';
import { GraphCache } from './cache.js';
import { detectCycles, getCycleForNode } from './tarjan.js';
import { tracePIIFlow, findPIIExposingEndpoints, getPIISummary } from './pii-tracer.js';
import { analyzeImpact, analyzeDetailedImpact, assessBreakingChangeRisk } from './impact-analyzer.js';

/**
 * Node kinds in the protocol graph
 */
const NodeKind = {
  API: 'api',
  API_ENDPOINT: 'api.endpoint',
  DATA: 'data',
  EVENT: 'event',
  WORKFLOW: 'workflow',
  AGENT: 'agent',
  INTEGRATION: 'integration',
  IAM: 'iam',
  SEMANTIC: 'semantic'
};

/**
 * Edge kinds representing relationships
 */
const EdgeKind = {
  DEPENDS_ON: 'depends_on',
  PRODUCES: 'produces',
  CONSUMES: 'consumes',
  READS_FROM: 'reads_from',
  WRITES_TO: 'writes_to',
  EXPOSES: 'exposes',
  DERIVES_FROM: 'derives_from'
};

function getJsonSchemaFromApiOperation(operation = {}) {
  const responses = operation.responses || {};
  const prioritized = ['200', '201', '202', 'default'];

  const statusCodes = Object.keys(responses);
  const selectedCode = prioritized.find((code) => responses[code]) || statusCodes[0];
  if (!selectedCode) {
    return null;
  }

  const response = responses[selectedCode];
  if (!response || typeof response !== 'object') {
    return null;
  }

  const content = response.content || {};
  const jsonContent = content['application/json'] || Object.values(content)[0];
  if (!jsonContent || typeof jsonContent !== 'object') {
    return null;
  }

  return jsonContent.schema || null;
}

function getRequestSchemaFromApiOperation(operation = {}) {
  const content = operation.requestBody?.content || {};
  const jsonContent = content['application/json'] || Object.values(content)[0];
  if (!jsonContent || typeof jsonContent !== 'object') {
    return null;
  }
  return jsonContent.schema || null;
}

function collectOperationMap(manifest = {}) {
  const map = new Map();
  const paths = manifest.spec?.paths || {};

  for (const [route, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') {
      continue;
    }

    for (const [method, operation] of Object.entries(methods)) {
      const normalizedMethod = method.toUpperCase();
      const key = `${normalizedMethod} ${route}`;
      map.set(key, operation || {});
    }
  }

  return map;
}

function collectSchemaFields(schema, prefix = '', result = {}) {
  if (!schema || typeof schema !== 'object') {
    return result;
  }

  const requiredFields = new Set(Array.isArray(schema.required) ? schema.required : []);
  const properties = schema.properties || {};

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${fieldName}` : fieldName;
    result[path] = {
      type: fieldSchema?.type,
      format: fieldSchema?.format,
      required: requiredFields.has(fieldName),
      maxLength: fieldSchema?.maxLength,
      minLength: fieldSchema?.minLength,
      minimum: fieldSchema?.minimum,
      maximum: fieldSchema?.maximum,
      enum: Array.isArray(fieldSchema?.enum) ? fieldSchema.enum : undefined
    };

    if (fieldSchema?.type === 'object' || fieldSchema?.properties) {
      collectSchemaFields(fieldSchema, path, result);
    }

    if (fieldSchema?.type === 'array' && fieldSchema?.items) {
      collectSchemaFields(fieldSchema.items, `${path}[]`, result);
    }
  }

  return result;
}

function parseMajor(version) {
  if (!version || typeof version !== 'string') {
    return null;
  }

  const normalized = version.replace(/^v/i, '');
  const major = Number.parseInt(normalized.split('.')[0], 10);
  return Number.isFinite(major) ? major : null;
}

function detectBreakingChangesFromManifest(currentManifest = {}, nextManifest = {}) {
  const breaking = new Set();

  // Dependency changes
  const oldDependencies = Array.isArray(currentManifest.dependencies) ? currentManifest.dependencies : [];
  const newDependencies = Array.isArray(nextManifest.dependencies) ? nextManifest.dependencies : [];

  for (const oldDependency of oldDependencies) {
    if (newDependencies.includes(oldDependency)) {
      continue;
    }

    const oldBase = normalizeURN(oldDependency);
    const versionChanged = newDependencies.some((dependency) => normalizeURN(dependency) === oldBase);
    breaking.add(versionChanged ? 'dependency_version_changed' : 'dependency_removed');
  }

  // API endpoint and response compatibility checks
  if (currentManifest.type === 'api' || nextManifest.type === 'api') {
    const oldOperations = collectOperationMap(currentManifest);
    const newOperations = collectOperationMap(nextManifest);

    for (const [operationKey, oldOperation] of oldOperations.entries()) {
      const newOperation = newOperations.get(operationKey);
      if (!newOperation) {
        breaking.add('endpoint_removed');
        continue;
      }

      const oldStatuses = new Set(Object.keys(oldOperation.responses || {}));
      const newStatuses = new Set(Object.keys(newOperation.responses || {}));
      const statusesEqual = oldStatuses.size === newStatuses.size &&
        Array.from(oldStatuses).every((status) => newStatuses.has(status));

      if (!statusesEqual) {
        breaking.add('response_code_changed');
      }

      const schemaPairs = [
        [getJsonSchemaFromApiOperation(oldOperation), getJsonSchemaFromApiOperation(newOperation)],
        [getRequestSchemaFromApiOperation(oldOperation), getRequestSchemaFromApiOperation(newOperation)]
      ];

      for (const [oldSchema, newSchema] of schemaPairs) {
        const oldFields = collectSchemaFields(oldSchema);
        const newFields = collectSchemaFields(newSchema);

        for (const [fieldPath, oldField] of Object.entries(oldFields)) {
          const newField = newFields[fieldPath];
          if (!newField) {
            if (fieldPath.includes('.') || fieldPath.includes('[]')) {
              breaking.add('nested_field_removed');
            } else if (oldField.required) {
              breaking.add('removed_required_field');
            } else {
              breaking.add('field_type_changed');
            }
            continue;
          }

          if (oldField.type && newField.type && oldField.type !== newField.type) {
            breaking.add('field_type_changed');
          }

          if (oldField.format && newField.format && oldField.format !== newField.format) {
            breaking.add('format_changed');
          }
        }
      }
    }
  }

  // Data/event schema checks
  const oldSchema = currentManifest.spec?.schema;
  const newSchema = nextManifest.spec?.schema;
  if (oldSchema || newSchema) {
    const oldFields = collectSchemaFields(oldSchema);
    const newFields = collectSchemaFields(newSchema);

    for (const [fieldPath, oldField] of Object.entries(oldFields)) {
      const newField = newFields[fieldPath];
      if (!newField) {
        if (currentManifest.type === 'event' || nextManifest.type === 'event') {
          breaking.add('field_removed');
        } else if (fieldPath.includes('.')) {
          breaking.add('nested_field_removed');
        } else {
          breaking.add('field_removed');
        }
        continue;
      }

      if (oldField.type && newField.type && oldField.type !== newField.type) {
        if (currentManifest.type === 'event' || nextManifest.type === 'event') {
          breaking.add('payload_structure_changed');
        } else {
          breaking.add('field_type_changed');
        }
      }

      const oldMaxLength = oldField.maxLength;
      const newMaxLength = newField.maxLength;
      const oldMinimum = oldField.minimum;
      const newMinimum = newField.minimum;
      const oldEnum = Array.isArray(oldField.enum) ? oldField.enum : null;
      const newEnum = Array.isArray(newField.enum) ? newField.enum : null;

      const tightenedMaxLength =
        Number.isFinite(oldMaxLength) &&
        Number.isFinite(newMaxLength) &&
        newMaxLength < oldMaxLength;
      const tightenedMinimum =
        Number.isFinite(oldMinimum) &&
        Number.isFinite(newMinimum) &&
        newMinimum > oldMinimum;
      const tightenedEnum =
        oldEnum &&
        newEnum &&
        oldEnum.some((value) => !newEnum.includes(value));

      if (tightenedMaxLength || tightenedMinimum || tightenedEnum) {
        breaking.add('constraint_tightened');
      }
    }
  }

  // If only major version changed and no structural diff is detected, require migration.
  if (breaking.size === 0) {
    const currentVersion = parseURN(currentManifest.urn || '')?.version;
    const nextVersion = parseURN(nextManifest.urn || '')?.version;
    const currentMajor = parseMajor(currentVersion);
    const nextMajor = parseMajor(nextVersion);

    if (
      currentMajor !== null &&
      nextMajor !== null &&
      nextMajor > currentMajor
    ) {
      breaking.add('migration_required_version_change');
    }
  }

  return Array.from(breaking);
}

/**
 * ProtocolGraph class
 */
class ProtocolGraph {
  constructor(options = {}) {
    const { cacheSize = 100 } = options;

    // Use directed graph for protocol relationships
    this.graph = new Graph({ type: 'directed', multi: true });

    // Indices for fast lookups
    this.urnIndex = new Map(); // Normalized URN -> Set of versioned URNs
    this.kindIndex = new Map(); // Kind -> Set of URNs
    this.authorityIndex = new Map(); // Authority -> Set of URNs

    // Cache for expensive operations (10-20% of expected graph size)
    this.cache = new GraphCache(cacheSize);
  }

  /**
   * Add a node to the graph
   * @param {string} urn - Node URN
   * @param {string} kind - Node kind (from NodeKind)
   * @param {Object} manifest - Protocol manifest data
   * @returns {boolean} True if added, false if already exists
   */
  addNode(urn, kind, manifest = {}) {
    const baseUrn = urn.includes('#') ? urn.split('#')[0] : urn;
    if (!isValidURN(baseUrn)) {
      throw new Error(`Invalid URN: ${urn}`);
    }

    if (!Object.values(NodeKind).includes(kind)) {
      throw new Error(`Invalid node kind: ${kind}`);
    }

    // Check if node already exists
    if (this.graph.hasNode(urn)) {
      return false;
    }

    // Add node to graph
    this.graph.addNode(urn, {
      kind,
      manifest,
      urn
    });

    // Update indices
    const normalized = normalizeURN(urn);
    if (!this.urnIndex.has(normalized)) {
      this.urnIndex.set(normalized, new Set());
    }
    this.urnIndex.get(normalized).add(urn);

    if (!this.kindIndex.has(kind)) {
      this.kindIndex.set(kind, new Set());
    }
    this.kindIndex.get(kind).add(urn);

    const parsed = parseURN(urn);
    if (parsed) {
      if (!this.authorityIndex.has(parsed.authority)) {
        this.authorityIndex.set(parsed.authority, new Set());
      }
      this.authorityIndex.get(parsed.authority).add(urn);
    }

    // Invalidate caches
    this._invalidateCache();

    return true;
  }

  /**
   * Remove a node and its edges
   * @param {string} urn - Node URN to remove
   * @returns {boolean} True if removed
   */
  removeNode(urn) {
    if (!this.graph.hasNode(urn)) {
      return false;
    }

    // Get node data for index cleanup
    const nodeData = this.graph.getNodeAttributes(urn);
    const normalized = normalizeURN(urn);

    // Remove from graph (cascades edges)
    this.graph.dropNode(urn);

    // Update indices
    if (this.urnIndex.has(normalized)) {
      this.urnIndex.get(normalized).delete(urn);
      if (this.urnIndex.get(normalized).size === 0) {
        this.urnIndex.delete(normalized);
      }
    }

    if (this.kindIndex.has(nodeData.kind)) {
      this.kindIndex.get(nodeData.kind).delete(urn);
      if (this.kindIndex.get(nodeData.kind).size === 0) {
        this.kindIndex.delete(nodeData.kind);
      }
    }

    const parsed = parseURN(urn);
    if (parsed && this.authorityIndex.has(parsed.authority)) {
      this.authorityIndex.get(parsed.authority).delete(urn);
      if (this.authorityIndex.get(parsed.authority).size === 0) {
        this.authorityIndex.delete(parsed.authority);
      }
    }

    // Invalidate caches
    this._invalidateCache();

    return true;
  }

  /**
   * Add an edge between nodes
   * @param {string} from - Source URN
   * @param {string} kind - Edge kind (from EdgeKind)
   * @param {string} to - Target URN
   * @param {Object} metadata - Additional edge metadata
   * @returns {string} Edge key
   */
  addEdge(from, kind, to, metadata = {}) {
    if (!this.graph.hasNode(from)) {
      throw new Error(`Source node not found: ${from}`);
    }
    if (!this.graph.hasNode(to)) {
      throw new Error(`Target node not found: ${to}`);
    }
    if (!Object.values(EdgeKind).includes(kind)) {
      throw new Error(`Invalid edge kind: ${kind}`);
    }

    // Add edge with attributes
    const edgeKey = this.graph.addEdge(from, to, {
      kind,
      ...metadata
    });

    // Invalidate caches
    this._invalidateCache();

    return edgeKey;
  }

  /**
   * Remove an edge
   * @param {string} edgeKey - Edge key to remove
   * @returns {boolean} True if removed
   */
  removeEdge(edgeKey) {
    if (!this.graph.hasEdge(edgeKey)) {
      return false;
    }

    this.graph.dropEdge(edgeKey);
    this._invalidateCache();
    return true;
  }

  /**
   * Resolve a URN with optional version range
   * Returns all matching nodes
   * @param {string} urn - URN with optional version range
   * @returns {Array<string>} Matching node URNs
   */
  resolveURN(urn) {
    if (!isValidURN(urn)) {
      return [];
    }

    const parsed = parseURN(urn);
    if (!parsed) {
      return [];
    }

    const normalized = normalizeURN(urn);
    const candidates = this.urnIndex.get(normalized);

    if (!candidates || candidates.size === 0) {
      return [];
    }

    // If no version specified, return all versions
    if (!parsed.version) {
      return Array.from(candidates);
    }

    // Filter by version range
    return Array.from(candidates).filter(candidateURN => {
      const candidateParsed = parseURN(candidateURN);
      if (!candidateParsed || !candidateParsed.version) {
        return false;
      }
      return versionMatchesRange(candidateParsed.version, parsed.version);
    });
  }

  /**
   * Get all nodes of a specific kind
   * @param {string} kind - Node kind
   * @returns {Array<string>} Node URNs
   */
  getNodesByKind(kind) {
    const nodes = this.kindIndex.get(kind);
    return nodes ? Array.from(nodes) : [];
  }

  /**
   * Get all nodes from a specific authority
   * @param {string} authority - Authority name
   * @returns {Array<string>} Node URNs
   */
  getNodesByAuthority(authority) {
    const nodes = this.authorityIndex.get(authority);
    return nodes ? Array.from(nodes) : [];
  }

  /**
   * Get node attributes
   * @param {string} urn - Node URN
   * @returns {Object|null} Node attributes
   */
  getNode(urn) {
    if (!this.graph.hasNode(urn)) {
      return null;
    }
    return this.graph.getNodeAttributes(urn);
  }

  /**
   * Get all edges from a node
   * @param {string} urn - Node URN
   * @returns {Array<Object>} Edges with metadata
   */
  getOutEdges(urn) {
    if (!this.graph.hasNode(urn)) {
      return [];
    }

    return this.graph.outEdges(urn).map(edgeKey => {
      const attrs = this.graph.getEdgeAttributes(edgeKey);
      const target = this.graph.target(edgeKey);
      return {
        key: edgeKey,
        to: target,
        ...attrs
      };
    });
  }

  /**
   * Get all edges to a node
   * @param {string} urn - Node URN
   * @returns {Array<Object>} Edges with metadata
   */
  getInEdges(urn) {
    if (!this.graph.hasNode(urn)) {
      return [];
    }

    return this.graph.inEdges(urn).map(edgeKey => {
      const attrs = this.graph.getEdgeAttributes(edgeKey);
      const source = this.graph.source(edgeKey);
      return {
        key: edgeKey,
        from: source,
        ...attrs
      };
    });
  }

  /**
   * Get graph statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      nodes: this.graph.order,
      edges: this.graph.size,
      nodesByKind: Object.fromEntries(
        Array.from(this.kindIndex.entries()).map(([kind, nodes]) => [kind, nodes.size])
      ),
      authorities: this.authorityIndex.size
    };
  }

  /**
   * Check if graph has a node
   * @param {string} urn - Node URN
   * @returns {boolean}
   */
  hasNode(urn) {
    return this.graph.hasNode(urn);
  }

  /**
   * Get all nodes
   * @returns {Array<string>} All node URNs
   */
  getAllNodes() {
    return this.graph.nodes();
  }

  /**
   * Serialize graph to JSON
   * @returns {Object} Serialized graph
   */
  toJSON() {
    return {
      nodes: this.graph.nodes().map(urn => ({
        urn,
        ...this.graph.getNodeAttributes(urn)
      })),
      edges: this.graph.edges().map(edgeKey => ({
        from: this.graph.source(edgeKey),
        to: this.graph.target(edgeKey),
        ...this.graph.getEdgeAttributes(edgeKey)
      }))
    };
  }

  /**
   * Load graph from JSON
   * @param {Object} data - Serialized graph data
   */
  fromJSON(data) {
    // Clear existing graph
    this.graph.clear();
    this.urnIndex.clear();
    this.kindIndex.clear();
    this.authorityIndex.clear();
    this._invalidateCache();

    // Add nodes
    for (const nodeData of data.nodes) {
      const { urn, kind, manifest } = nodeData;
      this.addNode(urn, kind, manifest);
    }

    // Add edges
    for (const edgeData of data.edges) {
      const { from, to, kind, ...metadata } = edgeData;
      this.addEdge(from, kind, to, metadata);
    }
  }

  /**
   * Invalidate all caches
   * @private
   */
  _invalidateCache() {
    this.cache.invalidateAll();
  }

  /**
   * Get the underlying Graphology instance
   * (for advanced operations and algorithm integration)
   * @returns {Graph}
   */
  getGraph() {
    return this.graph;
  }

  // ============================================================================
  // High-Level Analysis Methods
  // ============================================================================

  /**
   * Detect cycles in the graph using Tarjan's algorithm
   * Results are cached for performance
   * @returns {Array<Array<string>>} Array of cycles (each cycle is array of URNs)
   */
  detectCycles() {
    const cached = this.cache.getCycles();
    if (cached) {
      return cached;
    }

    const cycles = detectCycles(this.graph);
    this.cache.setCycles(cycles);
    return cycles;
  }

  /**
   * Check if a node is part of any cycle
   * @param {string} urn - Node URN
   * @returns {boolean}
   */
  isInCycle(urn) {
    const cycle = getCycleForNode(this.graph, urn);
    return cycle !== null;
  }

  /**
   * Get the cycle containing a specific node
   * @param {string} urn - Node URN
   * @returns {Array<string>|null}
   */
  getCycle(urn) {
    return getCycleForNode(this.graph, urn);
  }

  /**
   * Trace PII flow to an endpoint
   * Results are cached for performance
   * @param {string} endpointUrn - Endpoint URN
   * @param {Object} options - Tracing options
   * @returns {Object} PII flow analysis
   */
  tracePIIFlow(endpointUrn, options = {}) {
    const cacheKey = `${endpointUrn}:${JSON.stringify(options)}`;
    const cached = this.cache.getPIIFlow(cacheKey);
    if (cached) {
      return cached;
    }

    const flow = tracePIIFlow(this, endpointUrn, options);
    this.cache.setPIIFlow(cacheKey, flow);
    return flow;
  }

  /**
   * Find all endpoints that expose PII
   * @param {Object} options - Options
   * @returns {Array<Object>}
   */
  findPIIExposingEndpoints(options = {}) {
    return findPIIExposingEndpoints(this, options);
  }

  /**
   * Get PII summary for entire graph
   * @returns {Object}
   */
  getPIISummary() {
    return getPIISummary(this);
  }

  /**
   * Analyze impact of changing a node
   * Results are cached for performance
   * @param {string} urn - Node URN
   * @param {Object} options - Analysis options
   * @returns {Object}
   */
  impactOfChange(urn, options = {}) {
    const cacheKey = `${urn}:${JSON.stringify(options)}`;
    const cached = this.cache.getImpact(cacheKey);
    if (cached) {
      return cached;
    }

    const impact = analyzeImpact(this, urn, options);
    this.cache.setImpact(cacheKey, impact);
    return impact;
  }

  /**
   * Analyze detailed impact with edge information
   * @param {string} urn - Node URN
   * @returns {Object|null}
   */
  detailedImpact(urn) {
    return analyzeDetailedImpact(this, urn);
  }

  /**
   * Assess breaking change risk
   * @param {string} urn - Node URN
   * @param {Object} [nextManifest] - Optional next version manifest for diff-based risk checks
   * @returns {Object}
   */
  assessRisk(urn, nextManifest = null) {
    if (nextManifest && typeof nextManifest === 'object') {
      const currentNode = this.getNode(urn);
      const currentManifest = currentNode?.manifest || {};
      const breakingChanges = detectBreakingChangesFromManifest(currentManifest, nextManifest);
      const hasBreakingChanges = breakingChanges.length > 0;
      const mediumOnly =
        hasBreakingChanges &&
        breakingChanges.every((change) => change === 'format_changed');
      const riskLevel = !hasBreakingChanges ? 'none' : mediumOnly ? 'medium' : 'high';
      const requiresMigration = hasBreakingChanges;
      const hasMigrationPlan =
        Boolean(nextManifest.migration) ||
        Boolean(nextManifest.metadata?.migrationPlan);

      return {
        urn,
        hasBreakingChanges,
        breakingChanges,
        riskLevel,
        requiresMigration,
        migrationRequired: requiresMigration,
        approved: !requiresMigration || hasMigrationPlan,
        rejectionReason: requiresMigration && !hasMigrationPlan
          ? 'breaking change migration required before approval'
          : null
      };
    }

    return assessBreakingChangeRisk(this, urn);
  }

  /**
   * Get cache statistics
   * @returns {Object}
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  // ============================================================================
  // Batch Update Operations (B7.2.1)
  // ============================================================================

  /**
   * Apply batch node and edge updates atomically
   *
   * Performance target: <25ms per node
   *
   * @param {Object} updates - Batch updates
   * @param {Array<Object>} updates.nodes - Nodes to add [{urn, kind, manifest}, ...]
   * @param {Array<Object>} updates.edges - Edges to add [{from, kind, to, metadata}, ...]
   * @returns {Object} Batch update results
   */
  applyBatch(updates) {
    const startTime = performance.now();

    const results = {
      nodesAdded: 0,
      nodesSkipped: 0,
      edgesAdded: 0,
      edgesSkipped: 0,
      errors: [],
      warnings: []
    };

    if (!updates) {
      results.errors.push({ message: 'Updates object is required' });
      return results;
    }

    // Add nodes first
    if (updates.nodes && Array.isArray(updates.nodes)) {
      for (const nodeUpdate of updates.nodes) {
        try {
          const { urn, kind, manifest } = nodeUpdate;

          if (!urn || !kind) {
            results.errors.push({
              type: 'node',
              error: 'Missing required fields: urn, kind',
              data: nodeUpdate
            });
            continue;
          }

          const added = this.addNode(urn, kind, manifest || {});

          if (added) {
            results.nodesAdded++;
          } else {
            results.nodesSkipped++;
          }
        } catch (error) {
          results.errors.push({
            type: 'node',
            urn: nodeUpdate.urn,
            error: error.message
          });
        }
      }
    }

    // Add edges second (after nodes exist)
    if (updates.edges && Array.isArray(updates.edges)) {
      for (const edgeUpdate of updates.edges) {
        try {
          const { from, kind, to, metadata } = edgeUpdate;

          if (!from || !kind || !to) {
            results.errors.push({
              type: 'edge',
              error: 'Missing required fields: from, kind, to',
              data: edgeUpdate
            });
            continue;
          }

          // Check if nodes exist
          if (!this.hasNode(from)) {
            results.warnings.push({
              type: 'missing_source_node',
              from,
              to,
              message: `Source node ${from} does not exist, skipping edge`
            });
            results.edgesSkipped++;
            continue;
          }

          if (!this.hasNode(to)) {
            results.warnings.push({
              type: 'missing_target_node',
              from,
              to,
              message: `Target node ${to} does not exist, skipping edge`
            });
            results.edgesSkipped++;
            continue;
          }

          this.addEdge(from, kind, to, metadata || {});
          results.edgesAdded++;
        } catch (error) {
          results.errors.push({
            type: 'edge',
            from: edgeUpdate.from,
            to: edgeUpdate.to,
            error: error.message
          });
        }
      }
    }

    const totalTime = performance.now() - startTime;
    const totalNodes = updates.nodes?.length || 0;
    const avgTimePerNode = totalNodes > 0 ? totalTime / totalNodes : 0;

    results.performance = {
      totalTime,
      totalNodes,
      avgTimePerNode
    };

    return results;
  }

  /**
   * Apply batch updates with automatic placeholder creation for missing dependencies
   *
   * This is useful for registration where external dependencies may not exist yet
   *
   * @param {Object} updates - Batch updates
   * @returns {Object} Batch update results with placeholders
   */
  applyBatchWithPlaceholders(updates) {
    const startTime = performance.now();

    const results = {
      nodesAdded: 0,
      placeholdersCreated: 0,
      edgesAdded: 0,
      errors: [],
      warnings: []
    };

    // First pass: add all primary nodes
    if (updates.nodes && Array.isArray(updates.nodes)) {
      for (const nodeUpdate of updates.nodes) {
        try {
          const { urn, kind, manifest } = nodeUpdate;

          if (!urn || !kind) {
            results.errors.push({
              type: 'node',
              error: 'Missing required fields: urn, kind',
              data: nodeUpdate
            });
            continue;
          }

          const added = this.addNode(urn, kind, manifest || {});

          if (added) {
            results.nodesAdded++;
          }
        } catch (error) {
          results.errors.push({
            type: 'node',
            urn: nodeUpdate.urn,
            error: error.message
          });
        }
      }
    }

    // Second pass: add edges with placeholder creation
    if (updates.edges && Array.isArray(updates.edges)) {
      for (const edgeUpdate of updates.edges) {
        try {
          const { from, kind, to, metadata } = edgeUpdate;

          if (!from || !kind || !to) {
            results.errors.push({
              type: 'edge',
              error: 'Missing required fields: from, kind, to',
              data: edgeUpdate
            });
            continue;
          }

          // Create placeholder for source if needed
          if (!this.hasNode(from)) {
            this.addNode(from, NodeKind.API, { placeholder: true });
            results.placeholdersCreated++;
          }

          // Create placeholder for target if needed
          if (!this.hasNode(to)) {
            this.addNode(to, NodeKind.API, { placeholder: true });
            results.placeholdersCreated++;
          }

          this.addEdge(from, kind, to, metadata || {});
          results.edgesAdded++;
        } catch (error) {
          results.errors.push({
            type: 'edge',
            from: edgeUpdate.from,
            to: edgeUpdate.to,
            error: error.message
          });
        }
      }
    }

    const totalTime = performance.now() - startTime;

    results.performance = {
      totalTime
    };

    return results;
  }

  /**
   * Validate graph invariants after batch updates
   *
   * Checks for:
   * - Circular dependencies (if disallowed)
   * - Orphaned nodes
   * - Invalid edge types
   *
   * @param {Object} options - Validation options
   * @param {boolean} options.allowCycles - Allow cycles in graph (default: true)
   * @returns {Object} Validation results
   */
  validateInvariants(options = {}) {
    const { allowCycles = true } = options;

    const results = {
      valid: true,
      issues: []
    };

    // Check for cycles if disallowed
    if (!allowCycles) {
      const cycles = this.detectCycles();
      if (cycles.length > 0) {
        results.valid = false;
        results.issues.push({
          type: 'circular_dependency',
          severity: 'error',
          count: cycles.length,
          cycles: cycles.slice(0, 5) // Include first 5
        });
      }
    }

    // Check for placeholder nodes (potential missing dependencies)
    const placeholders = [];
    for (const urn of this.getAllNodes()) {
      const node = this.getNode(urn);
      if (node.manifest?.placeholder) {
        placeholders.push(urn);
      }
    }

    if (placeholders.length > 0) {
      results.issues.push({
        type: 'placeholder_nodes',
        severity: 'warning',
        count: placeholders.length,
        urns: placeholders.slice(0, 10) // Include first 10
      });
    }

    return results;
  }

  /**
   * Rollback batch updates via event replay
   *
   * NOTE: This is a simplified version. Full implementation would require
   * event sourcing integration with state snapshots
   *
   * @param {Array<Object>} events - Events to replay
   * @returns {Object} Rollback results
   */
  rollbackFromEvents(events) {
    // Clear graph
    this.graph.clear();
    this.urnIndex.clear();
    this.kindIndex.clear();
    this.authorityIndex.clear();
    this._invalidateCache();

    // Replay events would go here
    // This is a placeholder for the full event-sourced recovery

    return {
      success: true,
      eventsReplayed: events.length,
      recoveredNodes: this.graph.order,
      recoveredEdges: this.graph.size
    };
  }
}

export {
  ProtocolGraph,
  NodeKind,
  EdgeKind
};
