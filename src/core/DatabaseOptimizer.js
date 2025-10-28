// core/DatabaseOptimizer.js
// Complete database optimizer for JSONB performance optimization

export class DatabaseOptimizer {
  constructor(dbConnection, stateManager = null) {
    this.db = dbConnection;
    this.stateManager = stateManager;
    this.monitoring = true;
    this.autoSuggestions = true;
    this.metrics = {
      queriesLogged: 0,
      optimizationsApplied: 0,
      averageLatency: 0,
      suggestionsGenerated: 0
    };
    
    // Optimization thresholds
    this.thresholds = {
      slowQueryMs: 50,
      hotQueryCount: 100,
      criticalLatencyMs: 100,
      materializedViewRows: 10000,
      partitionRows: 1000000
    };

    // Performance monitoring intervals
    this.intervals = {
      queryAnalysis: 5 * 60 * 1000,    // 5 minutes
      optimization: 60 * 60 * 1000,    // 1 hour  
      viewRefresh: 30 * 60 * 1000      // 30 minutes
    };
  }

  /**
   * Initialize the database optimizer
   */
  async initialize() {
    try {
      console.log('🔧 Initializing DatabaseOptimizer...');
      
      // Verify schema exists
      await this.verifySchema();
      
      // Load existing optimizations
      await this.loadOptimizations();
      
      // Start monitoring if enabled
      if (this.monitoring) {
        this.startMonitoring();
      }
      
      // Start auto-suggestions if enabled  
      if (this.autoSuggestions) {
        this.startAutoSuggestions();
      }

      console.log('✅ DatabaseOptimizer initialized');
      return true;

    } catch (error) {
      console.error('Failed to initialize DatabaseOptimizer:', error);
      throw error;
    }
  }

  /**
   * Verify required schema exists
   */
  async verifySchema() {
    const requiredTables = [
      'database_optimizations',
      'query_performance_log', 
      'index_suggestions'
    ];

    for (const table of requiredTables) {
      const result = await this.db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [table]);
      
      if (!result.rows[0].exists) {
        throw new Error(`Required table ${table} not found. Please apply the complete database schema.`);
      }
    }
  }

  /**
   * Load existing optimizations from database
   */
  async loadOptimizations() {
    try {
      const result = await this.db.query(`
        SELECT 
          optimization_type,
          COUNT(*) as count,
          AVG(performance_gain) as avg_gain
        FROM database_optimizations 
        WHERE status = 'applied'
        GROUP BY optimization_type
      `);

      console.log('📊 Loaded optimization history:', result.rows);
      
    } catch (error) {
      console.error('Failed to load optimization history:', error);
    }
  }

  /**
   * Start performance monitoring
   */
  startMonitoring() {
    // Analyze query patterns
    setInterval(() => {
      this.analyzeQueryPatterns();
    }, this.intervals.queryAnalysis);

    // Refresh materialized views
    setInterval(() => {
      this.refreshMaterializedViews();
    }, this.intervals.viewRefresh);

    console.log('📈 Performance monitoring started');
  }

  /**
   * Start automatic optimization suggestions
   */
  startAutoSuggestions() {
    setInterval(() => {
      this.generateOptimizationSuggestions();
    }, this.intervals.optimization);

    console.log('💡 Auto-suggestions enabled');
  }

  /**
   * Log query performance for analysis
   */
  async logQuery(tableName, queryPattern, jsonbPath, executionTime, rowCount = null, scanType = 'unknown', indexUsed = null) {
    try {
      // Don't log if monitoring is disabled
      if (!this.monitoring) return;

      // Insert into performance log
      await this.db.query(`
        INSERT INTO query_performance_log 
        (table_name, query_pattern, jsonb_path, execution_time_ms, row_count, scan_type, index_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [tableName, queryPattern, jsonbPath, executionTime, rowCount, scanType, indexUsed]);

      this.metrics.queriesLogged++;

      // Check if this query needs immediate attention
      if (executionTime > this.thresholds.criticalLatencyMs) {
        await this.handleCriticalSlowQuery(tableName, jsonbPath, executionTime);
      }

    } catch (error) {
      console.error('Failed to log query performance:', error);
    }
  }

  /**
   * Handle critically slow queries immediately
   */
  async handleCriticalSlowQuery(tableName, jsonbPath, executionTime) {
    try {
      // Check if we already have a suggestion for this
      const existing = await this.db.query(`
        SELECT id FROM index_suggestions 
        WHERE table_name = $1 AND jsonb_path = $2 
        AND status IN ('pending', 'approved')
      `, [tableName, jsonbPath]);

      if (existing.rows.length > 0) return;

      // Create urgent index suggestion
      await this.createIndexSuggestion(
        tableName, 
        jsonbPath, 
        'urgent_index',
        { executionTime, urgency: 'critical' }
      );

      console.log(`🚨 Critical slow query detected: ${tableName}.${jsonbPath} (${executionTime}ms)`);

    } catch (error) {
      console.error('Failed to handle critical slow query:', error);
    }
  }

  /**
   * Analyze query patterns from logged data
   */
  async analyzeQueryPatterns() {
    try {
      // Get slow query patterns from last hour
      const result = await this.db.query(`
        SELECT 
          table_name,
          jsonb_path,
          COUNT(*) as query_count,
          AVG(execution_time_ms) as avg_latency,
          MAX(execution_time_ms) as max_latency,
          ARRAY_AGG(DISTINCT scan_type) as scan_types
        FROM query_performance_log 
        WHERE logged_at > now() - interval '1 hour'
        AND execution_time_ms > $1
        GROUP BY table_name, jsonb_path
        HAVING COUNT(*) > $2
        ORDER BY AVG(execution_time_ms) DESC
        LIMIT 20
      `, [this.thresholds.slowQueryMs, this.thresholds.hotQueryCount]);

      for (const pattern of result.rows) {
        await this.evaluateOptimizationOpportunity(pattern);
      }

      if (result.rows.length > 0) {
        console.log(`🔍 Analyzed ${result.rows.length} slow query patterns`);
      }

    } catch (error) {
      console.error('Failed to analyze query patterns:', error);
    }
  }

  /**
   * Evaluate optimization opportunity for a query pattern
   */
  async evaluateOptimizationOpportunity(pattern) {
    const { table_name, jsonb_path, query_count, avg_latency, max_latency, scan_types } = pattern;

    try {
      // Determine optimization strategy
      let optimizationType;
      let estimatedBenefit;

      if (query_count > this.thresholds.materializedViewRows) {
        optimizationType = 'materialized_view';
        estimatedBenefit = Math.min(avg_latency * 0.8, 90); // Up to 90% improvement
      } else if (query_count > 1000 && scan_types.includes('sequential_scan')) {
        optimizationType = 'partial_index';
        estimatedBenefit = Math.min(avg_latency * 0.6, 70); // Up to 70% improvement  
      } else {
        optimizationType = 'gin_index';
        estimatedBenefit = Math.min(avg_latency * 0.4, 50); // Up to 50% improvement
      }

      // Create suggestion if beneficial
      if (estimatedBenefit > 10) { // Only if we expect >10ms improvement
        await this.createIndexSuggestion(table_name, jsonb_path, optimizationType, {
          queryCount: query_count,
          avgLatency: avg_latency,
          maxLatency: max_latency,
          estimatedBenefit,
          scanTypes: scan_types
        });
      }

    } catch (error) {
      console.error('Failed to evaluate optimization opportunity:', error);
    }
  }

  /**
   * Create an index suggestion
   */
  async createIndexSuggestion(tableName, jsonbPath, suggestionType, metadata = {}) {
    try {
      let suggestedSql, rollbackSql;
      const indexName = `idx_${tableName}_${jsonbPath.replace(/[^a-z0-9]/g, '_')}`;

      switch (suggestionType) {
        case 'gin_index':
          suggestedSql = `CREATE INDEX CONCURRENTLY ${indexName} ON ${tableName} USING gin ((data->>'${jsonbPath}'));`;
          rollbackSql = `DROP INDEX IF EXISTS ${indexName};`;
          break;

        case 'partial_index':
          // Create partial index for most common entity type
          const typeAnalysis = await this.db.query(`
            SELECT type, COUNT(*) as count
            FROM ${tableName}
            WHERE data->>'${jsonbPath}' IS NOT NULL
            GROUP BY type
            ORDER BY count DESC
            LIMIT 1
          `);
          
          const mostCommonType = typeAnalysis.rows[0]?.type || 'unknown';
          suggestedSql = `CREATE INDEX CONCURRENTLY ${indexName}_partial ON ${tableName} USING gin ((data->>'${jsonbPath}')) WHERE type = '${mostCommonType}';`;
          rollbackSql = `DROP INDEX IF EXISTS ${indexName}_partial;`;
          break;

        case 'materialized_view':
          const viewName = `${tableName}_${jsonbPath}_view`;
          suggestedSql = `
            CREATE MATERIALIZED VIEW ${viewName} AS
            SELECT 
              id,
              type,
              domain,
              data->>'${jsonbPath}' AS ${jsonbPath},
              data,
              created_at,
              updated_at
            FROM ${tableName}
            WHERE data->>'${jsonbPath}' IS NOT NULL
            WITH DATA;
            
            CREATE UNIQUE INDEX ${viewName}_id ON ${viewName} (id);
            CREATE INDEX ${viewName}_${jsonbPath} ON ${viewName} (${jsonbPath});
          `;
          rollbackSql = `DROP MATERIALIZED VIEW IF EXISTS ${viewName};`;
          break;

        case 'urgent_index':
          suggestedSql = `CREATE INDEX CONCURRENTLY ${indexName}_urgent ON ${tableName} USING gin ((data->>'${jsonbPath}'));`;
          rollbackSql = `DROP INDEX IF EXISTS ${indexName}_urgent;`;
          break;

        default:
          throw new Error(`Unknown suggestion type: ${suggestionType}`);
      }

      // Insert suggestion
      const result = await this.db.query(`
        INSERT INTO index_suggestions 
        (table_name, jsonb_path, suggestion_type, estimated_benefit, query_frequency, 
         avg_query_time, suggested_sql, rollback_sql, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        ON CONFLICT (table_name, jsonb_path, suggestion_type) 
        DO UPDATE SET
          estimated_benefit = EXCLUDED.estimated_benefit,
          query_frequency = EXCLUDED.query_frequency,
          avg_query_time = EXCLUDED.avg_query_time,
          created_at = now()
        RETURNING id
      `, [
        tableName,
        jsonbPath, 
        suggestionType,
        metadata.estimatedBenefit || 0,
        metadata.queryCount || 0,
        metadata.avgLatency || 0,
        suggestedSql,
        rollbackSql
      ]);

      this.metrics.suggestionsGenerated++;

      console.log(`💡 Created ${suggestionType} suggestion for ${tableName}.${jsonbPath}`);
      
      return result.rows[0].id;

    } catch (error) {
      console.error('Failed to create index suggestion:', error);
      return null;
    }
  }

  /**
   * Apply an optimization suggestion
   */
  async applyOptimization(suggestionId, approvedBy = 'system') {
    try {
      // Get suggestion details
      const result = await this.db.query(`
        SELECT * FROM index_suggestions WHERE id = $1
      `, [suggestionId]);

      if (result.rows.length === 0) {
        throw new Error(`Suggestion ${suggestionId} not found`);
      }

      const suggestion = result.rows[0];

      if (suggestion.status !== 'pending' && suggestion.status !== 'approved') {
        throw new Error(`Cannot apply suggestion in status: ${suggestion.status}`);
      }

      console.log(`🔧 Applying ${suggestion.suggestion_type} optimization...`);

      // Execute the optimization SQL
      const startTime = Date.now();
      await this.db.query(suggestion.suggested_sql);
      const executionTime = Date.now() - startTime;

      // Update suggestion status
      await this.db.query(`
        UPDATE index_suggestions 
        SET status = 'applied', applied_at = now()
        WHERE id = $1
      `, [suggestionId]);

      // Record in optimizations table
      await this.db.query(`
        INSERT INTO database_optimizations 
        (optimization_type, table_name, target_field, sql_definition, rollback_sql, 
         query_count, avg_latency_before, status, approved_at, applied_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'applied', now(), now(), $8)
      `, [
        suggestion.suggestion_type,
        suggestion.table_name,
        suggestion.jsonb_path,
        suggestion.suggested_sql,
        suggestion.rollback_sql,
        suggestion.query_frequency,
        suggestion.avg_query_time,
        JSON.stringify({ 
          suggestionId,
          approvedBy,
          executionTimeMs: executionTime,
          estimatedBenefit: suggestion.estimated_benefit
        })
      ]);

      this.metrics.optimizationsApplied++;

      console.log(`✅ Applied ${suggestion.suggestion_type} optimization in ${executionTime}ms`);

      // Emit event if state manager available
      if (this.stateManager?.eventFlowEngine) {
        this.stateManager.eventFlowEngine.emit('optimization_applied', {
          id: suggestionId,
          type: suggestion.suggestion_type,
          table: suggestion.table_name,
          field: suggestion.jsonb_path,
          executionTime,
          approvedBy
        });
      }

      return true;

    } catch (error) {
      console.error(`Failed to apply optimization ${suggestionId}:`, error);

      // Update suggestion status to failed
      await this.db.query(`
        UPDATE index_suggestions 
        SET status = 'failed'
        WHERE id = $1
      `, [suggestionId]).catch(() => {});

      throw error;
    }
  }

  /**
   * Rollback an applied optimization
   */
  async rollbackOptimization(optimizationId) {
    try {
      const result = await this.db.query(`
        SELECT * FROM database_optimizations WHERE id = $1
      `, [optimizationId]);

      if (result.rows.length === 0) {
        throw new Error(`Optimization ${optimizationId} not found`);
      }

      const optimization = result.rows[0];

      if (optimization.status !== 'applied') {
        throw new Error(`Cannot rollback optimization in status: ${optimization.status}`);
      }

      if (!optimization.rollback_sql) {
        throw new Error('No rollback SQL available');
      }

      console.log(`🔙 Rolling back ${optimization.optimization_type}...`);

      // Execute rollback SQL
      await this.db.query(optimization.rollback_sql);

      // Update status
      await this.db.query(`
        UPDATE database_optimizations 
        SET status = 'rolled_back'
        WHERE id = $1
      `, [optimizationId]);

      console.log(`✅ Rolled back ${optimization.optimization_type}`);

      return true;

    } catch (error) {
      console.error(`Failed to rollback optimization ${optimizationId}:`, error);
      throw error;
    }
  }

  /**
   * Generate optimization suggestions automatically
   */
  async generateOptimizationSuggestions() {
    try {
      console.log('🔍 Generating optimization suggestions...');

      // Call the database function to get suggestions
      const result = await this.db.query(`
        SELECT * FROM suggest_jsonb_indexes()
        WHERE query_count > $1 AND avg_time > $2
        ORDER BY avg_time DESC, query_count DESC
        LIMIT 10
      `, [this.thresholds.hotQueryCount, this.thresholds.slowQueryMs]);

      for (const suggestion of result.rows) {
        await this.createIndexSuggestion(
          suggestion.table_name,
          suggestion.jsonb_path,
          'gin_index',
          {
            queryCount: suggestion.query_count,
            avgLatency: suggestion.avg_time,
            estimatedBenefit: Math.min(suggestion.avg_time * 0.4, 50)
          }
        );
      }

      if (result.rows.length > 0) {
        console.log(`💡 Generated ${result.rows.length} optimization suggestions`);
      }

    } catch (error) {
      console.error('Failed to generate optimization suggestions:', error);
    }
  }

  /**
   * Refresh materialized views
   */
  async refreshMaterializedViews() {
    try {
      console.log('🔄 Refreshing materialized views...');

      const startTime = Date.now();
      await this.db.query('SELECT refresh_performance_views()');
      const executionTime = Date.now() - startTime;

      console.log(`✅ Materialized views refreshed in ${executionTime}ms`);

      // Log the performance
      await this.logQuery(
        'materialized_views',
        'refresh_performance_views',
        'system',
        executionTime,
        null,
        'refresh'
      );

    } catch (error) {
      console.error('Failed to refresh materialized views:', error);
    }
  }

  /**
   * Get pending suggestions for admin panel
   */
  async getPendingSuggestions() {
    try {
      const result = await this.db.query(`
        SELECT 
          id,
          table_name,
          jsonb_path,
          suggestion_type,
          estimated_benefit,
          query_frequency,
          avg_query_time,
          created_at
        FROM index_suggestions 
        WHERE status = 'pending'
        ORDER BY estimated_benefit DESC, query_frequency DESC
      `);

      return result.rows;

    } catch (error) {
      console.error('Failed to get pending suggestions:', error);
      return [];
    }
  }

  /**
   * Get applied optimizations with performance impact
   */
  async getAppliedOptimizations() {
    try {
      const result = await this.db.query(`
        SELECT 
          o.*,
          COALESCE(
            (SELECT avg(execution_time_ms) 
             FROM query_performance_log q 
             WHERE q.table_name = o.table_name 
             AND q.jsonb_path = o.target_field 
             AND q.logged_at > o.applied_at
             LIMIT 100), 
            o.avg_latency_before
          ) as avg_latency_after
        FROM database_optimizations o
        WHERE status = 'applied'
        ORDER BY applied_at DESC
      `);

      // Calculate performance gains
      return result.rows.map(opt => ({
        ...opt,
        performance_gain: opt.avg_latency_before && opt.avg_latency_after 
          ? ((opt.avg_latency_before - opt.avg_latency_after) / opt.avg_latency_before * 100)
          : null
      }));

    } catch (error) {
      console.error('Failed to get applied optimizations:', error);
      return [];
    }
  }

  /**
   * Get current database performance metrics
   */
  async getPerformanceMetrics() {
    try {
      const [slowQueries, tableStats, indexStats] = await Promise.all([
        this.db.query('SELECT * FROM slow_query_analysis LIMIT 10'),
        this.db.query('SELECT * FROM database_performance_overview LIMIT 10'),
        this.db.query(`
          SELECT 
            schemaname, tablename, indexname, idx_scan, idx_tup_read,
            pg_size_pretty(pg_relation_size(indexrelid)) as index_size
          FROM pg_stat_user_indexes 
          WHERE schemaname = 'public'
          ORDER BY idx_scan DESC 
          LIMIT 10
        `)
      ]);

      return {
        slowQueries: slowQueries.rows,
        tableStats: tableStats.rows,
        indexStats: indexStats.rows,
        systemMetrics: this.metrics
      };

    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return null;
    }
  }

  /**
   * Get optimization opportunities
   */
  async getOptimizationOpportunities() {
    try {
      const result = await this.db.query('SELECT * FROM optimization_opportunities LIMIT 20');
      return result.rows;

    } catch (error) {
      console.error('Failed to get optimization opportunities:', error);
      return [];
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config) {
    if (config.thresholds) {
      this.thresholds = { ...this.thresholds, ...config.thresholds };
    }
    
    if (config.intervals) {
      this.intervals = { ...this.intervals, ...config.intervals };
    }

    if (typeof config.monitoring === 'boolean') {
      this.monitoring = config.monitoring;
    }

    if (typeof config.autoSuggestions === 'boolean') {
      this.autoSuggestions = config.autoSuggestions;
    }

    console.log('📝 DatabaseOptimizer configuration updated');
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      thresholds: this.thresholds,
      monitoring: this.monitoring,
      autoSuggestions: this.autoSuggestions
    };
  }

  /**
   * Shutdown the optimizer
   */
  async shutdown() {
    console.log('🛑 Shutting down DatabaseOptimizer...');
    this.monitoring = false;
    this.autoSuggestions = false;
    // Clear any running intervals would go here
    console.log('✅ DatabaseOptimizer shutdown complete');
  }
}

export default DatabaseOptimizer;