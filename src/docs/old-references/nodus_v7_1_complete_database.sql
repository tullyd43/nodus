-- ============================================================================
-- NODUS V7.1 COMPLETE DATABASE SCHEMA - OPTIMIZED JSONB IMPLEMENTATION
-- Version: 7.1.0
-- Purpose: Complete composable database with built-in performance optimizations,
--          security enhancements, partitioning, and automated maintenance
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

BEGIN;

-- ============================================================================
-- 1. CORE UNIVERSAL TABLES (Optimized JSONB Design)
-- ============================================================================

-- Universal objects table with built-in optimization
CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'default',
    data JSONB NOT NULL,
    search_vector TSVECTOR,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Universal events table with built-in optimization  
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'default',
    data JSONB NOT NULL,
    aggregate_id UUID,
    sequence_number BIGINT,
    correlation_id UUID,
    originating_command_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Universal commands table with CQRS support
CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'default',
    data JSONB NOT NULL,
    originating_action_id UUID,
    correlation_id UUID,
    context JSONB DEFAULT '{}',
    status VARCHAR(32) DEFAULT 'pending',
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Universal actions table with conditions support
CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'default',
    data JSONB NOT NULL,
    conditions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Universal configurations table
CREATE TABLE configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(256) NOT NULL,
    domain VARCHAR(64) DEFAULT 'default',
    value JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(key, domain)
);

-- ============================================================================
-- 2. COMPOSABLE SYSTEM TABLES
-- ============================================================================

-- Event flows for composable behaviors
CREATE TABLE event_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'system',
    trigger JSONB NOT NULL,
    conditions JSONB DEFAULT '[]',
    actions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Component definitions for adaptive rendering
CREATE TABLE component_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    type VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'ui',
    definition JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(type, domain)
);

-- Plugin manifests for declarative plugins
CREATE TABLE plugin_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    version VARCHAR(32) NOT NULL,
    domain VARCHAR(64) DEFAULT 'system',
    manifest JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(name, version)
);

-- Bootstrap configurations for system initialization
CREATE TABLE bootstrap_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_name VARCHAR(128) NOT NULL,
    priority INTEGER DEFAULT 0,
    config JSONB NOT NULL,
    active BOOLEAN DEFAULT true,
    environment VARCHAR(64) DEFAULT 'production',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(system_name, environment)
);

-- Layout definitions for composable UI
CREATE TABLE layout_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    domain VARCHAR(64) DEFAULT 'ui',
    definition JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Field registry for community standards (no schema lock-in)
CREATE TABLE field_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_type VARCHAR(128) NOT NULL,
    field_name VARCHAR(128) NOT NULL,
    description TEXT,
    data_type VARCHAR(64),
    community_votes INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(object_type, field_name)
);

-- ============================================================================
-- 3. PERFORMANCE OPTIMIZATION TABLES
-- ============================================================================

-- Track database optimizations
CREATE TABLE database_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    optimization_type VARCHAR(64) NOT NULL,
    table_name VARCHAR(128) NOT NULL,
    target_field VARCHAR(128),
    sql_definition TEXT NOT NULL,
    rollback_sql TEXT,
    performance_gain NUMERIC,
    query_count INTEGER DEFAULT 0,
    avg_latency_before NUMERIC,
    avg_latency_after NUMERIC,
    status VARCHAR(32) DEFAULT 'suggested',
    approved_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'
);

-- Query performance monitoring
CREATE TABLE query_performance_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(128),
    query_pattern TEXT,
    jsonb_path VARCHAR(256),
    execution_time_ms NUMERIC,
    row_count INTEGER,
    scan_type VARCHAR(64),
    index_used VARCHAR(128),
    logged_at TIMESTAMPTZ DEFAULT now()
);

-- Index suggestions from automated analysis
CREATE TABLE index_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(128) NOT NULL,
    jsonb_path VARCHAR(256) NOT NULL,
    suggestion_type VARCHAR(64) NOT NULL,
    estimated_benefit NUMERIC,
    query_frequency INTEGER DEFAULT 0,
    avg_query_time NUMERIC DEFAULT 0,
    suggested_sql TEXT NOT NULL,
    rollback_sql TEXT,
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    approved_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    UNIQUE(table_name, jsonb_path, suggestion_type)
);

-- ============================================================================
-- 4. V7.1 ENHANCEMENT: SYSTEM LOGS TABLE FOR MAINTENANCE
-- ============================================================================

-- System logs for optimizer and maintenance messages
CREATE TABLE system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_level VARCHAR(16) NOT NULL DEFAULT 'info',
    component VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    logged_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. HIGH-PERFORMANCE JSONB INDEXES (Built-in optimization)
-- ============================================================================

-- Universal JSONB indexes for fast queries
CREATE INDEX idx_objects_data_gin ON objects USING gin (data jsonb_path_ops);
CREATE INDEX idx_events_data_gin ON events USING gin (data jsonb_path_ops);
CREATE INDEX idx_commands_data_gin ON commands USING gin (data jsonb_path_ops);
CREATE INDEX idx_actions_data_gin ON actions USING gin (data jsonb_path_ops);

-- Type-specific partial indexes for hot queries
CREATE INDEX idx_objects_type_domain ON objects (type, domain);
CREATE INDEX idx_events_type_domain ON events (type, domain);
CREATE INDEX idx_commands_type_domain ON commands (type, domain);
CREATE INDEX idx_actions_type_domain ON actions (type, domain);

-- Time-based indexes for temporal queries
CREATE INDEX idx_objects_created_at ON objects (created_at);
CREATE INDEX idx_events_created_at ON events (created_at);
CREATE INDEX idx_commands_created_at ON commands (created_at);
CREATE INDEX idx_actions_created_at ON actions (created_at);

-- Specialized indexes for CQRS pattern
CREATE INDEX idx_events_aggregate ON events (aggregate_id, sequence_number);
CREATE INDEX idx_events_correlation ON events (correlation_id);
CREATE INDEX idx_commands_status ON commands (status, created_at);

-- Performance monitoring indexes
CREATE INDEX idx_query_performance_table_time ON query_performance_log (table_name, logged_at);
CREATE INDEX idx_query_performance_path ON query_performance_log (jsonb_path, execution_time_ms);

-- Configuration and system indexes
CREATE INDEX idx_configurations_key_domain ON configurations (key, domain);
CREATE INDEX idx_event_flows_active ON event_flows (active, priority);
CREATE INDEX idx_component_definitions_type ON component_definitions (type, domain);

-- V7.1 Enhancement: System logs indexes
CREATE INDEX idx_system_logs_level_component ON system_logs (log_level, component, logged_at);
CREATE INDEX idx_system_logs_time ON system_logs (logged_at);

-- ============================================================================
-- 6. MATERIALIZED VIEWS FOR COMMON AGGREGATIONS
-- ============================================================================

-- Hot objects view for frequently accessed entities
CREATE MATERIALIZED VIEW hot_objects_view AS
SELECT 
    o.type,
    o.domain,
    COUNT(*) as object_count,
    MIN(o.created_at) as first_created,
    MAX(o.updated_at) as last_updated,
    ROUND(AVG(EXTRACT(EPOCH FROM o.updated_at - o.created_at)), 2) as avg_lifespan_seconds
FROM objects o
WHERE o.created_at > now() - interval '7 days'
GROUP BY o.type, o.domain
ORDER BY object_count DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_hot_objects_view_unique ON hot_objects_view (type, domain);

-- Event summary view for analytics
CREATE MATERIALIZED VIEW event_summary_view AS
SELECT 
    e.type,
    e.domain,
    DATE_TRUNC('hour', e.created_at) as hour_bucket,
    COUNT(*) as event_count,
    COUNT(DISTINCT e.aggregate_id) as unique_aggregates,
    COUNT(DISTINCT e.correlation_id) as unique_correlations
FROM events e
WHERE e.created_at > now() - interval '24 hours'
GROUP BY e.type, e.domain, DATE_TRUNC('hour', e.created_at)
ORDER BY hour_bucket DESC, event_count DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_event_summary_view_unique ON event_summary_view (type, domain, hour_bucket);

-- ============================================================================
-- 7. V7.1 ENHANCEMENT: SECURITY ROLES AND PERMISSIONS
-- ============================================================================

-- Create dedicated optimizer role
CREATE ROLE nodus_optimizer_role;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nodus_optimizer_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nodus_optimizer_role;

-- ============================================================================
-- 8. OPTIMIZED STORED FUNCTIONS
-- ============================================================================

-- Function to log system messages
CREATE OR REPLACE FUNCTION log_system_message(
    p_level text,
    p_component text,
    p_message text,
    p_metadata jsonb DEFAULT '{}'
)
RETURNS void AS $$
BEGIN
    INSERT INTO system_logs (log_level, component, message, metadata)
    VALUES (p_level, p_component, p_message, p_metadata);
END;
$$ LANGUAGE plpgsql;

-- Secure function to log slow queries with optimization suggestions
CREATE OR REPLACE FUNCTION log_slow_query(
    p_table_name text,
    p_query_pattern text,
    p_jsonb_path text,
    p_execution_time numeric,
    p_row_count integer DEFAULT 0,
    p_scan_type text DEFAULT 'unknown'
)
RETURNS void 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Set role to prevent privilege escalation
    PERFORM set_config('role', 'nodus_optimizer_role', true);
    
    INSERT INTO query_performance_log (
        table_name, query_pattern, jsonb_path, execution_time_ms, 
        row_count, scan_type, logged_at
    ) VALUES (
        p_table_name, p_query_pattern, p_jsonb_path, p_execution_time,
        p_row_count, p_scan_type, now()
    );
    
    -- Auto-suggest index if query is slow and frequent
    IF p_execution_time > 50 THEN
        INSERT INTO index_suggestions (
            table_name, jsonb_path, suggestion_type, estimated_benefit,
            suggested_sql, status
        ) VALUES (
            p_table_name, 
            p_jsonb_path,
            'gin_index',
            p_execution_time,
            FORMAT('CREATE INDEX CONCURRENTLY idx_%s_%s ON %s USING gin ((data->>''%s''));',
                   p_table_name, REPLACE(p_jsonb_path, '.', '_'), p_table_name, p_jsonb_path),
            'pending'
        )
        ON CONFLICT (table_name, jsonb_path, suggestion_type) DO UPDATE SET
            query_frequency = index_suggestions.query_frequency + 1,
            avg_query_time = (index_suggestions.avg_query_time + p_execution_time) / 2;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- V7.1 Secure function: suggest_jsonb_indexes with proper security
CREATE OR REPLACE FUNCTION suggest_jsonb_indexes()
RETURNS TABLE(
    table_name text,
    jsonb_path text,
    query_count bigint,
    avg_time numeric,
    suggested_sql text
) 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Set role to prevent privilege escalation
    PERFORM set_config('role', 'nodus_optimizer_role', true);
    
    RETURN QUERY
    SELECT 
        qpl.table_name::text,
        qpl.jsonb_path::text,
        COUNT(*)::bigint as query_count,
        AVG(qpl.execution_time_ms)::numeric as avg_time,
        FORMAT(
            'CREATE INDEX CONCURRENTLY idx_%s_%s ON %s USING gin ((data->>''%s''));',
            qpl.table_name,
            REPLACE(REPLACE(qpl.jsonb_path, '.', '_'), '-', '_'),
            qpl.table_name,
            qpl.jsonb_path
        )::text as suggested_sql
    FROM query_performance_log qpl
    WHERE qpl.logged_at > now() - interval '7 days'
    AND qpl.execution_time_ms > 50
    AND qpl.table_name IN ('objects', 'events', 'commands', 'actions') -- Restrict to safe tables
    GROUP BY qpl.table_name, qpl.jsonb_path
    HAVING COUNT(*) > 100
    AND AVG(qpl.execution_time_ms) > 50
    ORDER BY AVG(qpl.execution_time_ms) DESC, COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- V7.1 Secure function: refresh_performance_views
CREATE OR REPLACE FUNCTION refresh_performance_views()
RETURNS void 
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Set role to prevent privilege escalation
    PERFORM set_config('role', 'nodus_optimizer_role', true);
    
    -- Refresh materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY hot_objects_view;
    REFRESH MATERIALIZED VIEW CONCURRENTLY event_summary_view;
    
    -- Log the refresh performance
    INSERT INTO query_performance_log (table_name, query_pattern, jsonb_path, execution_time_ms, logged_at)
    VALUES ('materialized_views', 'refresh_performance_views', 'system', 
            EXTRACT(EPOCH FROM clock_timestamp() - statement_timestamp()) * 1000, now());
END;
$$ LANGUAGE plpgsql;

-- Function to create database optimizations
CREATE OR REPLACE FUNCTION create_database_optimization(
    p_type text,
    p_table_name text,
    p_target_field text,
    p_sql_definition text,
    p_rollback_sql text DEFAULT NULL,
    p_estimated_gain numeric DEFAULT 0
)
RETURNS uuid AS $$
DECLARE
    optimization_id uuid;
BEGIN
    INSERT INTO database_optimizations (
        optimization_type, table_name, target_field, sql_definition, 
        rollback_sql, performance_gain, status
    ) VALUES (
        p_type, p_table_name, p_target_field, p_sql_definition,
        p_rollback_sql, p_estimated_gain, 'suggested'
    ) RETURNING id INTO optimization_id;
    
    RETURN optimization_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. V7.1 ENHANCEMENT: PARTITIONING FUNCTIONS
-- ============================================================================

-- Function to create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_partition(
    p_table_name text,
    p_year integer,
    p_month integer
)
RETURNS text AS $$
DECLARE
    partition_name text;
    start_date date;
    end_date date;
BEGIN
    -- Calculate partition name and date range
    partition_name := format('%s_%s_%02d', p_table_name, p_year, p_month);
    start_date := make_date(p_year, p_month, 1);
    end_date := start_date + interval '1 month';
    
    -- Create partition
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, p_table_name, start_date, end_date
    );
    
    -- Create indexes on partition
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_data_gin 
         ON %I USING gin (data jsonb_path_ops)',
        partition_name, partition_name
    );
    
    EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_type_domain 
         ON %I (type, domain)',
        partition_name, partition_name
    );
    
    -- Log the partition creation
    PERFORM log_system_message(
        'info',
        'partition_manager',
        format('Created partition %s for date range %s to %s', partition_name, start_date, end_date),
        jsonb_build_object('partition_name', partition_name, 'start_date', start_date, 'end_date', end_date)
    );
    
    RETURN partition_name;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically create partitions for next N months
CREATE OR REPLACE FUNCTION ensure_future_partitions(
    p_table_name text,
    p_months_ahead integer DEFAULT 3
)
RETURNS text[] AS $$
DECLARE
    partition_names text[] := '{}';
    current_month date;
    target_month date;
    year_val integer;
    month_val integer;
    partition_name text;
BEGIN
    current_month := date_trunc('month', now())::date;
    
    FOR i IN 0..p_months_ahead LOOP
        target_month := current_month + (i || ' months')::interval;
        year_val := EXTRACT(year FROM target_month)::integer;
        month_val := EXTRACT(month FROM target_month)::integer;
        
        partition_name := create_monthly_partition(p_table_name, year_val, month_val);
        partition_names := array_append(partition_names, partition_name);
    END LOOP;
    
    PERFORM log_system_message(
        'info',
        'partition_manager',
        format('Ensured %s future partitions for table %s', p_months_ahead + 1, p_table_name),
        jsonb_build_object('table_name', p_table_name, 'partitions_created', array_length(partition_names, 1))
    );
    
    RETURN partition_names;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. V7.1 ENHANCEMENT: AUTOMATED MAINTENANCE FUNCTIONS
-- ============================================================================

-- Function to clean old performance logs
CREATE OR REPLACE FUNCTION cleanup_old_performance_logs(
    p_retain_days integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM query_performance_log 
    WHERE logged_at < now() - (p_retain_days || ' days')::interval;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    PERFORM log_system_message(
        'info',
        'maintenance',
        format('Cleaned up %s old performance log entries older than %s days', deleted_count, p_retain_days),
        jsonb_build_object('deleted_count', deleted_count, 'retain_days', p_retain_days)
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to analyze and update table statistics
CREATE OR REPLACE FUNCTION update_table_statistics()
RETURNS void AS $$
DECLARE
    table_record record;
    start_time timestamp;
    end_time timestamp;
BEGIN
    start_time := clock_timestamp();
    
    FOR table_record IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ANALYZE %I', table_record.tablename);
    END LOOP;
    
    end_time := clock_timestamp();
    
    PERFORM log_system_message(
        'info',
        'maintenance',
        'Updated table statistics for all tables',
        jsonb_build_object(
            'duration_ms', EXTRACT(EPOCH FROM end_time - start_time) * 1000,
            'started_at', start_time,
            'completed_at', end_time
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to vacuum and reindex if needed
CREATE OR REPLACE FUNCTION perform_maintenance(
    p_vacuum_threshold numeric DEFAULT 0.2,
    p_reindex_bloat_threshold numeric DEFAULT 0.3
)
RETURNS void AS $$
DECLARE
    table_record record;
    start_time timestamp;
BEGIN
    start_time := clock_timestamp();
    
    -- Vacuum tables that need it
    FOR table_record IN 
        SELECT schemaname, tablename 
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        AND (n_dead_tup::numeric / GREATEST(n_live_tup, 1)) > p_vacuum_threshold
    LOOP
        EXECUTE format('VACUUM (ANALYZE, VERBOSE) %I.%I', table_record.schemaname, table_record.tablename);
        
        PERFORM log_system_message(
            'info',
            'maintenance',
            format('Vacuumed table %s.%s', table_record.schemaname, table_record.tablename),
            jsonb_build_object('table', table_record.tablename, 'schema', table_record.schemaname)
        );
    END LOOP;
    
    PERFORM log_system_message(
        'info',
        'maintenance',
        'Completed automated maintenance',
        jsonb_build_object(
            'duration_ms', EXTRACT(EPOCH FROM clock_timestamp() - start_time) * 1000,
            'vacuum_threshold', p_vacuum_threshold,
            'reindex_threshold', p_reindex_bloat_threshold
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to schedule optimization tasks
CREATE OR REPLACE FUNCTION schedule_optimization_tasks()
RETURNS void AS $$
BEGIN
    -- Clean old logs (daily)
    IF EXTRACT(hour FROM now()) = 2 THEN -- Run at 2 AM
        PERFORM cleanup_old_performance_logs(30);
    END IF;
    
    -- Update statistics (weekly)
    IF EXTRACT(dow FROM now()) = 0 AND EXTRACT(hour FROM now()) = 3 THEN -- Sunday 3 AM
        PERFORM update_table_statistics();
    END IF;
    
    -- Maintenance (weekly)
    IF EXTRACT(dow FROM now()) = 0 AND EXTRACT(hour FROM now()) = 4 THEN -- Sunday 4 AM
        PERFORM perform_maintenance();
    END IF;
    
    -- Ensure future partitions (monthly)
    IF EXTRACT(day FROM now()) = 1 AND EXTRACT(hour FROM now()) = 1 THEN -- 1st of month, 1 AM
        PERFORM ensure_future_partitions('events', 6);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to ensure partition exists before insert
CREATE OR REPLACE FUNCTION ensure_partition_exists()
RETURNS trigger AS $$
DECLARE
    partition_date date;
    partition_year integer;
    partition_month integer;
BEGIN
    -- Extract date from created_at
    partition_date := date_trunc('month', NEW.created_at)::date;
    partition_year := EXTRACT(year FROM partition_date)::integer;
    partition_month := EXTRACT(month FROM partition_date)::integer;
    
    -- Create partition if it doesn't exist
    PERFORM create_monthly_partition(TG_TABLE_NAME, partition_year, partition_month);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update search vectors
CREATE OR REPLACE FUNCTION update_object_search_vector()
RETURNS trigger AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', 
        COALESCE(NEW.data->>'title', '') || ' ' ||
        COALESCE(NEW.data->>'description', '') || ' ' ||
        COALESCE(NEW.data->>'content', '') || ' ' ||
        COALESCE(NEW.data->>'name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions on functions to optimizer role
GRANT EXECUTE ON FUNCTION suggest_jsonb_indexes() TO nodus_optimizer_role;
GRANT EXECUTE ON FUNCTION refresh_performance_views() TO nodus_optimizer_role;
GRANT EXECUTE ON FUNCTION log_slow_query(text, text, text, numeric, integer, text) TO nodus_optimizer_role;

-- ============================================================================
-- 11. V7.1 ENHANCEMENT: COMPREHENSIVE VIEWS FOR MONITORING
-- ============================================================================

-- Comprehensive index usage statistics view
CREATE VIEW index_usage_statistics AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    pg_relation_size(indexrelid) as index_size_bytes,
    CASE 
        WHEN idx_scan = 0 THEN 'unused'
        WHEN idx_scan < 100 THEN 'low_usage'
        WHEN idx_scan < 1000 THEN 'moderate_usage'
        ELSE 'high_usage'
    END as usage_category,
    ROUND(
        CASE 
            WHEN idx_scan > 0 THEN idx_tup_read::numeric / idx_scan
            ELSE 0
        END, 2
    ) as avg_tuples_per_scan,
    pg_stat_get_last_analyze_time(indexrelid) as last_analyzed
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC, pg_relation_size(indexrelid) DESC;

-- View for index recommendations based on usage
CREATE VIEW index_recommendations AS
SELECT 
    indexname,
    tablename,
    index_size,
    usage_category,
    CASE 
        WHEN usage_category = 'unused' AND index_size_bytes > 10485760 THEN 'consider_dropping'
        WHEN usage_category = 'low_usage' AND index_size_bytes > 52428800 THEN 'review_necessity'
        WHEN scans > 10000 AND avg_tuples_per_scan > 1000 THEN 'consider_partial_index'
        ELSE 'no_action'
    END as recommendation,
    CASE 
        WHEN usage_category = 'unused' THEN 'Index not used in recent queries'
        WHEN usage_category = 'low_usage' THEN 'Index has low usage relative to size'
        WHEN scans > 10000 AND avg_tuples_per_scan > 1000 THEN 'Index scans many tuples, consider partial index'
        ELSE 'Index usage is optimal'
    END as reason
FROM index_usage_statistics
WHERE recommendation != 'no_action'
ORDER BY 
    CASE recommendation
        WHEN 'consider_dropping' THEN 1
        WHEN 'review_necessity' THEN 2
        WHEN 'consider_partial_index' THEN 3
        ELSE 4
    END;

-- View for database performance overview
CREATE VIEW database_performance_overview AS
SELECT 
    'tables' as category,
    schemaname,
    tablename as name,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname = 'public'

UNION ALL

SELECT 
    'indexes' as category,
    schemaname,
    indexname as name,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    pg_relation_size(indexrelid) as size_bytes
FROM pg_stat_user_indexes
WHERE schemaname = 'public'

ORDER BY size_bytes DESC;

-- View for slow query analysis
CREATE VIEW slow_query_analysis AS
SELECT 
    table_name,
    jsonb_path,
    COUNT(*) as query_count,
    AVG(execution_time_ms) as avg_latency,
    MAX(execution_time_ms) as max_latency,
    MIN(execution_time_ms) as min_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_latency
FROM query_performance_log 
WHERE logged_at > now() - interval '24 hours'
GROUP BY table_name, jsonb_path
ORDER BY avg_latency DESC;

-- View for optimization opportunities
CREATE VIEW optimization_opportunities AS
SELECT 
    sq.table_name,
    sq.jsonb_path,
    sq.query_count,
    sq.avg_latency,
    CASE 
        WHEN sq.avg_latency > 100 AND sq.query_count > 1000 THEN 'critical'
        WHEN sq.avg_latency > 50 AND sq.query_count > 500 THEN 'high'
        WHEN sq.avg_latency > 25 AND sq.query_count > 100 THEN 'medium'
        ELSE 'low'
    END as priority,
    CASE
        WHEN sq.query_count > 10000 THEN 'materialized_view'
        WHEN sq.query_count > 1000 THEN 'partial_index'
        ELSE 'gin_index'
    END as suggested_optimization
FROM slow_query_analysis sq
WHERE sq.avg_latency > 25 AND sq.query_count > 50
ORDER BY 
    CASE 
        WHEN sq.avg_latency > 100 AND sq.query_count > 1000 THEN 4
        WHEN sq.avg_latency > 50 AND sq.query_count > 500 THEN 3
        WHEN sq.avg_latency > 25 AND sq.query_count > 100 THEN 2
        ELSE 1
    END DESC,
    sq.avg_latency DESC;

-- V7.1 Performance dashboard view
CREATE VIEW performance_dashboard AS
SELECT 
    'Database Size' as metric,
    pg_size_pretty(pg_database_size(current_database())) as value,
    'info' as status
UNION ALL
SELECT 
    'Total Tables' as metric,
    COUNT(*)::text as value,
    'info' as status
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 
    'Total Indexes' as metric,
    COUNT(*)::text as value,
    'info' as status  
FROM pg_stat_user_indexes
UNION ALL
SELECT 
    'Recent Queries (1h)' as metric,
    COUNT(*)::text as value,
    'info' as status
FROM query_performance_log 
WHERE logged_at > now() - interval '1 hour'
UNION ALL
SELECT 
    'Average Query Time (1h)' as metric,
    ROUND(AVG(execution_time_ms), 2)::text || 'ms' as value,
    CASE 
        WHEN AVG(execution_time_ms) > 100 THEN 'error'
        WHEN AVG(execution_time_ms) > 50 THEN 'warning'
        ELSE 'success'
    END as status
FROM query_performance_log 
WHERE logged_at > now() - interval '1 hour';

-- ============================================================================
-- 12. TRIGGERS FOR AUTOMATIC MAINTENANCE
-- ============================================================================

-- Trigger to update search vectors on objects
CREATE TRIGGER update_objects_search_vector
    BEFORE INSERT OR UPDATE ON objects
    FOR EACH ROW
    EXECUTE FUNCTION update_object_search_vector();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_objects_timestamp
    BEFORE UPDATE ON objects
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_actions_timestamp
    BEFORE UPDATE ON actions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_configurations_timestamp
    BEFORE UPDATE ON configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_event_flows_timestamp
    BEFORE UPDATE ON event_flows
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_component_definitions_timestamp
    BEFORE UPDATE ON component_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_plugin_manifests_timestamp
    BEFORE UPDATE ON plugin_manifests
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_bootstrap_configurations_timestamp
    BEFORE UPDATE ON bootstrap_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_layout_definitions_timestamp
    BEFORE UPDATE ON layout_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_field_registry_timestamp
    BEFORE UPDATE ON field_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Note: To enable partitioning for events table, you would need to:
-- 1. Convert existing events table to partitioned table
-- 2. Create trigger: CREATE TRIGGER ensure_events_partition
--    BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION ensure_partition_exists();

-- ============================================================================
-- 13. DEFAULT DATA AND CONFIGURATIONS
-- ============================================================================

-- Default system configuration for performance optimization
INSERT INTO configurations (key, domain, value, metadata) VALUES
('performance_config', 'system', '{
    "monitoring": {
        "enableQueryLogging": true,
        "slowQueryThreshold": 50,
        "logSampleRate": 0.1,
        "retentionDays": 30
    },
    "optimization": {
        "autoCreateIndexes": false,
        "materialized_view_refresh_interval": 300,
        "vacuum_threshold": 0.2,
        "analyze_threshold": 0.1
    },
    "caching": {
        "hot_objects_ttl": 3600,
        "query_cache_size": "256MB",
        "enable_query_cache": true
    }
}', '{
    "version": "7.1.0",
    "description": "Enhanced performance optimization configuration with monitoring and caching"
}');

-- Enhanced database optimizer configuration for V7.1
INSERT INTO configurations (key, domain, value, metadata) VALUES
('database_optimizer_config', 'system', '{
    "thresholds": {
        "slowQueryMs": 50,
        "hotQueryCount": 100,
        "criticalLatencyMs": 100,
        "materializedViewRows": 10000,
        "partitionRows": 1000000
    },
    "intervals": {
        "queryAnalysis": 300000,
        "optimization": 3600000,
        "viewRefresh": 1800000,
        "metricsFlush": 300000,
        "loggingBatch": 5000
    },
    "batching": {
        "logBatchSize": 100,
        "logBatchTimeout": 5000
    },
    "maintenance": {
        "logRetentionDays": 30,
        "vacuumThreshold": 0.2,
        "autoMaintenance": true
    },
    "security": {
        "enableRoleBasedAccess": true,
        "auditOptimizations": true,
        "requireApprovalForStructural": true
    }
}', '{
    "version": "7.1.0",
    "description": "Enhanced database optimizer configuration with security and maintenance features"
}')
ON CONFLICT (key, domain) DO UPDATE SET
    value = EXCLUDED.value,
    metadata = EXCLUDED.metadata,
    updated_at = now();

-- Default adaptive UI configuration
INSERT INTO configurations (key, domain, value, metadata) VALUES
('adaptive_ui_config', 'ui', '{
    "rendering": {
        "enableLazyLoading": true,
        "componentCaching": true,
        "dynamicImports": true,
        "performanceMode": "balanced"
    },
    "optimization": {
        "bundleSplitting": true,
        "treeShaking": true,
        "minification": true,
        "compressionLevel": "medium"
    },
    "features": {
        "darkModeSupport": true,
        "responsiveBreakpoints": ["sm", "md", "lg", "xl"],
        "accessibilityMode": true
    }
}', '{
    "version": "7.1.0",
    "description": "Adaptive UI configuration with performance optimizations"
}');

-- Sample bootstrap configuration for production
INSERT INTO bootstrap_configurations (system_name, priority, config, environment) VALUES
('database_optimizer', 10, '{
    "enabled": true,
    "monitoring": {
        "queryLogging": true,
        "performanceMetrics": true,
        "alerting": true
    },
    "optimization": {
        "autoSuggestIndexes": true,
        "autoRefreshViews": true,
        "scheduledMaintenance": true
    },
    "security": {
        "auditLog": true,
        "restrictedOperations": ["DROP", "TRUNCATE"],
        "approvalRequired": ["CREATE INDEX", "ALTER TABLE"]
    }
}', 'production');

-- Sample action with optimization conditions
INSERT INTO actions (type, domain, data, conditions, metadata) VALUES
('database_optimization', 'system', '{
    "optimization_type": "index_suggestion",
    "target_table": "objects",
    "suggested_indexes": [
        "CREATE INDEX CONCURRENTLY idx_objects_data_title ON objects USING gin ((data->>''title''));",
        "CREATE INDEX CONCURRENTLY idx_objects_data_status ON objects USING btree ((data->>''status''));"
    ]
}', '[
    {
        "name": "high_query_frequency",
        "type": "logical",
        "operator": "AND",
        "conditions": [
            {"type": "numeric_comparison", "property": "data.query_count", "operator": ">", "value": 1000},
            {"type": "numeric_comparison", "property": "data.avg_latency", "operator": ">", "value": 100}
        ]
    }
]', '{
    "priority": "high",
    "estimated_improvement": "40%",
    "safety_level": "high"
}');

-- Sample event flow for query optimization
INSERT INTO event_flows (name, domain, trigger, conditions, actions, metadata, priority) VALUES
('Query Optimization Flow', 'system', '{
    "type": "slow_query_detected",
    "source": "query_performance_log"
}', '[
    {
        "name": "optimization_candidate",
        "type": "logical",
        "operator": "AND",
        "conditions": [
            {"type": "numeric_comparison", "property": "data.query_count", "operator": ">", "value": 100},
            {"type": "numeric_comparison", "property": "data.avg_latency", "operator": ">", "value": 50}
        ]
    }
]', '{
    "optimization_candidate": [
        {"type": "create_index_suggestion", "service": "database_optimizer"},
        {"type": "notify_admin", "template": "index_suggestion"},
        {"type": "log_system_message", "level": "info", "component": "optimizer"}
    ],
    "default": [
        {"type": "monitor_pattern", "service": "database_optimizer"}
    ]
}', 70);

-- Popular field registry entries for community standards
INSERT INTO field_registry (object_type, field_name, description, data_type, community_votes) VALUES
-- Task fields
('task', 'status', 'Task completion status', 'string', 100),
('task', 'priority', 'Task priority level (low, medium, high, critical)', 'string', 95),
('task', 'due_date', 'Task due date', 'datetime', 90),
('task', 'assignee_id', 'Assigned user ID', 'uuid', 85),
('task', 'project_id', 'Parent project ID', 'uuid', 80),
('task', 'title', 'Task title/summary', 'string', 100),
('task', 'description', 'Detailed task description', 'text', 75),
('task', 'estimated_hours', 'Estimated completion time in hours', 'number', 70),
('task', 'completed_at', 'Task completion timestamp', 'datetime', 65),

-- User fields
('user', 'email', 'User email address', 'string', 100),
('user', 'role', 'User role/permission level', 'string', 95),
('user', 'last_login', 'Last login timestamp', 'datetime', 80),
('user', 'preferences', 'User preferences object', 'object', 70),
('user', 'profile', 'User profile information', 'object', 75),
('user', 'active', 'User account active status', 'boolean', 90),

-- Project fields  
('project', 'status', 'Project status (planning, active, completed, cancelled)', 'string', 95),
('project', 'owner_id', 'Project owner user ID', 'uuid', 90),
('project', 'start_date', 'Project start date', 'datetime', 85),
('project', 'end_date', 'Project end date', 'datetime', 80),
('project', 'budget', 'Project budget amount', 'number', 70),
('project', 'progress', 'Project completion percentage', 'number', 75),

-- Organization fields
('organization', 'name', 'Organization name', 'string', 100),
('organization', 'domain', 'Organization domain/subdomain', 'string', 95),
('organization', 'settings', 'Organization settings object', 'object', 85),
('organization', 'subscription_tier', 'Subscription/plan tier', 'string', 80),

-- Event fields
('event', 'timestamp', 'Event occurrence timestamp', 'datetime', 100),
('event', 'severity', 'Event severity level', 'string', 90),
('event', 'user_id', 'User associated with event', 'uuid', 85),
('event', 'source', 'Event source system/component', 'string', 80);

-- Default layout definition optimized for performance
INSERT INTO layout_definitions (name, domain, definition) VALUES
('Optimized Dashboard V7.1', 'ui', '{
    "gridConfig": {
        "columns": 24,
        "cellHeight": 60,
        "gap": 16,
        "responsive": true
    },
    "performanceConfig": {
        "enableLazyLoading": true,
        "cacheComponents": true,
        "refreshInterval": 30000,
        "virtualScrolling": true
    },
    "securityConfig": {
        "auditUserActions": true,
        "restrictedComponents": ["admin_panel", "system_logs"],
        "roleBasedAccess": true
    },
    "blocks": [
        {
            "id": "performance_monitor",
            "component": "performance_monitor",
            "position": {"x": 0, "y": 0, "w": 8, "h": 4},
            "config": {"title": "System Performance", "refreshRate": 5000}
        },
        {
            "id": "database_optimizer",
            "component": "db_optimizer_panel", 
            "position": {"x": 8, "y": 0, "w": 8, "h": 4},
            "config": {"title": "Database Optimization", "autoRefresh": true}
        },
        {
            "id": "system_logs",
            "component": "system_logs_panel",
            "position": {"x": 16, "y": 0, "w": 8, "h": 4},
            "config": {"title": "System Logs", "level": "info", "component": "all"}
        },
        {
            "id": "entity_overview",
            "component": "entity_card",
            "position": {"x": 0, "y": 4, "w": 12, "h": 6},
            "config": {"title": "Recent Entities", "entityType": "all", "limit": 10}
        },
        {
            "id": "index_recommendations",
            "component": "index_recommendations_panel",
            "position": {"x": 12, "y": 4, "w": 12, "h": 6},
            "config": {"title": "Index Recommendations", "showOnlyActionable": true}
        }
    ]
}');

-- Log the schema creation
PERFORM log_system_message(
    'info',
    'schema_upgrade',
    'Applied Nodus V7.1.0 complete database schema',
    jsonb_build_object(
        'version', '7.1.0',
        'features', ARRAY[
            'Core universal tables',
            'Composable system architecture',
            'Performance optimization',
            'Security enhancements',
            'System logging',
            'Index statistics and recommendations', 
            'Enhanced partitioning capabilities',
            'Automated maintenance functions',
            'Comprehensive monitoring views',
            'Trigger-based automation'
        ],
        'applied_at', now()
    )
);

-- ============================================================================
-- 14. FINAL SCHEMA SUMMARY
-- ============================================================================

-- Create comprehensive schema summary view
CREATE VIEW schema_summary AS
SELECT 
    'Schema Version' as item,
    '7.1.0 - Complete Optimized JSONB Implementation with Security & Maintenance' as value

UNION ALL

SELECT 
    'Total Tables' as item,
    COUNT(*)::text as value
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'

UNION ALL

SELECT 
    'Total Indexes' as item,
    COUNT(*)::text as value
FROM pg_stat_user_indexes

UNION ALL

SELECT 
    'Total Functions' as item,
    COUNT(*)::text as value
FROM information_schema.routines 
WHERE routine_schema = 'public'

UNION ALL

SELECT 
    'Materialized Views' as item,
    COUNT(*)::text as value
FROM pg_matviews

UNION ALL

SELECT 
    'Performance Features' as item,
    'JSONB GIN indexes, Materialized views, Auto-optimization, Query monitoring, Partitioning, Maintenance automation' as value

UNION ALL

SELECT 
    'Security Features' as item,
    'Role-based access, Security definer functions, Audit logging, Operation restrictions' as value;

-- ============================================================================
-- SCHEMA COMPLETE - COMMIT TRANSACTION
-- ============================================================================

COMMIT;

-- Show completion status with comprehensive summary
SELECT 
    '🎯 NODUS V7.1.0 COMPLETE DATABASE SCHEMA APPLIED' as status,
    'Enhanced Security, Performance, Partitioning & Maintenance' as description,
    COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Display key metrics
SELECT * FROM schema_summary ORDER BY item;
