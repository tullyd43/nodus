// ui/admin/DatabaseOptimizationControlPanel.js
// Complete admin control panel for database optimization management

export class DatabaseOptimizationControlPanel {
  constructor(optimizer, container) {
    this.optimizer = optimizer;
    this.container = container;
    this.currentView = "dashboard";
    this.refreshInterval = null;
    this.data = {
      dashboard: null,
      suggestions: [],
      applied: [],
      metrics: null,
      health: null,
    };

    // Real-time update settings
    this.updateInterval = 30000; // 30 seconds
    this.charts = {};
  }

  /**
   * Initialize the complete control panel
   */
  async initialize() {
    try {
      console.log("🎛️ Initializing Database Optimization Control Panel...");

      this.render();
      await this.loadAllData();
      this.setupEventListeners();
      this.startRealTimeUpdates();

      console.log("✅ Control Panel initialized");
    } catch (error) {
      console.error("Failed to initialize control panel:", error);
      this.showError("Failed to initialize control panel", error.message);
    }
  }

  /**
   * Render the complete panel structure
   */
  render() {
    this.container.innerHTML = `
      <div class="db-optimization-panel">
        <!-- Header -->
        <div class="panel-header">
          <div class="header-left">
            <h1>Database Optimization Control Panel</h1>
            <div class="health-indicator" id="health-indicator">
              <span class="status-dot" id="status-dot"></span>
              <span class="status-text" id="status-text">Checking...</span>
            </div>
          </div>
          <div class="header-actions">
            <button class="btn btn-secondary" onclick="this.exportReport()">
              📊 Export Report
            </button>
            <button class="btn btn-primary" onclick="this.refreshAllData()">
              🔄 Refresh All
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="panel-navigation">
          <button class="nav-tab active" data-view="dashboard" onclick="this.switchView('dashboard')">
            🎯 Dashboard
          </button>
          <button class="nav-tab" data-view="suggestions" onclick="this.switchView('suggestions')">
            💡 Suggestions <span class="badge" id="suggestions-badge">0</span>
          </button>
          <button class="nav-tab" data-view="applied" onclick="this.switchView('applied')">
            ✅ Applied <span class="badge" id="applied-badge">0</span>
          </button>
          <button class="nav-tab" data-view="performance" onclick="this.switchView('performance')">
            📈 Performance
          </button>
          <button class="nav-tab" data-view="maintenance" onclick="this.switchView('maintenance')">
            🔧 Maintenance
          </button>
        </div>

        <!-- Content Area -->
        <div class="panel-content" id="panel-content">
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading optimization data...</p>
          </div>
        </div>
      </div>

      <style>
        .db-optimization-panel {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .panel-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .panel-header h1 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
        }

        .health-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          opacity: 0.9;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #10b981;
          animation: pulse 2s infinite;
        }

        .status-dot.warning { background: #f59e0b; }
        .status-dot.error { background: #ef4444; }
        .status-dot.idle { background: #6b7280; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .btn {
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #2563eb;
          color: white;
        }

        .btn-primary:hover {
          background: #1d4ed8;
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: rgba(255,255,255,0.2);
          color: white;
          border: 1px solid rgba(255,255,255,0.3);
        }

        .btn-secondary:hover {
          background: rgba(255,255,255,0.3);
        }

        .panel-navigation {
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          overflow-x: auto;
        }

        .nav-tab {
          padding: 16px 24px;
          border: none;
          background: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
          border-bottom: 3px solid transparent;
          transition: all 0.2s;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .nav-tab:hover {
          color: #1e293b;
          background: #f1f5f9;
        }

        .nav-tab.active {
          color: #2563eb;
          border-bottom-color: #2563eb;
          background: white;
        }

        .badge {
          background: #ef4444;
          color: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: 600;
          min-width: 18px;
          text-align: center;
        }

        .panel-content {
          padding: 24px;
          min-height: 600px;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 400px;
          color: #64748b;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top: 3px solid #2563eb;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Dashboard Layout */
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
        }

        .metric-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          transition: all 0.2s;
        }

        .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .metric-card h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .metric-value {
          font-size: 32px;
          font-weight: 700;
          color: #2563eb;
          margin-bottom: 8px;
        }

        .metric-subtitle {
          font-size: 14px;
          color: #64748b;
        }

        .metric-trend {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 500;
          margin-top: 8px;
        }

        .trend-up { color: #10b981; }
        .trend-down { color: #ef4444; }
        .trend-neutral { color: #64748b; }

        /* Chart Container */
        .chart-container {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .chart-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }

        .chart-controls {
          display: flex;
          gap: 8px;
        }

        .chart-control {
          padding: 6px 12px;
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .chart-control.active {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
        }

        /* Table Styles */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .data-table th {
          background: #f8fafc;
          padding: 16px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 1px solid #e2e8f0;
        }

        .data-table td {
          padding: 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
        }

        .data-table tbody tr:hover {
          background: #f8fafc;
        }

        .status-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-pending {
          background: #fef3c7;
          color: #d97706;
        }

        .status-applied {
          background: #d1fae5;
          color: #059669;
        }

        .status-failed {
          background: #fee2e2;
          color: #dc2626;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
          border-radius: 6px;
        }

        .btn-success {
          background: #10b981;
          color: white;
          border: none;
        }

        .btn-danger {
          background: #ef4444;
          color: white;
          border: none;
        }

        .btn-info {
          background: #3b82f6;
          color: white;
          border: none;
        }

        /* Alert Styles */
        .alert {
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 20px;
          border-left: 4px solid;
        }

        .alert-info {
          background: #eff6ff;
          border-color: #2563eb;
          color: #1e40af;
        }

        .alert-warning {
          background: #fffbeb;
          border-color: #f59e0b;
          color: #92400e;
        }

        .alert-success {
          background: #f0fdf4;
          border-color: #10b981;
          color: #047857;
        }

        .alert-error {
          background: #fef2f2;
          border-color: #ef4444;
          color: #b91c1c;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .panel-header {
            flex-direction: column;
            gap: 16px;
            align-items: flex-start;
          }

          .header-actions {
            width: 100%;
            justify-content: space-between;
          }

          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .panel-navigation {
            overflow-x: auto;
          }

          .data-table {
            font-size: 14px;
          }

          .data-table th,
          .data-table td {
            padding: 12px 8px;
          }
        }
      </style>
    `;

    // Set up global click handlers
    this.container.addEventListener("click", (e) => {
      if (e.target.matches("[onclick]")) {
        const method = e.target
          .getAttribute("onclick")
          .match(/this\.(\w+)\('?([^']*)'?\)/);
        if (method && this[method[1]]) {
          e.preventDefault();
          this[method[1]](method[2] || undefined);
        }
      }
    });
  }

  /**
   * Load all data for the panel
   */
  async loadAllData() {
    try {
      const [dashboard, suggestions, applied, metrics, health] =
        await Promise.all([
          this.loadDashboardData(),
          this.optimizer.getPendingSuggestions(),
          this.optimizer.getAppliedOptimizations(),
          this.optimizer.getEnhancedMetrics(),
          this.optimizer.getHealthStatus(),
        ]);

      this.data = { dashboard, suggestions, applied, metrics, health };
      this.updateHealthIndicator();
      this.updateBadges();
      this.renderCurrentView();
    } catch (error) {
      console.error("Failed to load panel data:", error);
      this.showError("Failed to load data", error.message);
    }
  }

  /**
   * Load dashboard-specific data
   */
  async loadDashboardData() {
    try {
      return await this.optimizer.getPerformanceMetrics();
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      return null;
    }
  }

  /**
   * Switch between panel views
   */
  switchView(view) {
    // Update navigation
    this.container.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === view);
    });

    this.currentView = view;
    this.renderCurrentView();
  }

  /**
   * Render the current view content
   */
  renderCurrentView() {
    const content = this.container.querySelector("#panel-content");

    switch (this.currentView) {
      case "dashboard":
        content.innerHTML = this.renderDashboardView();
        this.initializeDashboardCharts();
        break;
      case "suggestions":
        content.innerHTML = this.renderSuggestionsView();
        break;
      case "applied":
        content.innerHTML = this.renderAppliedView();
        break;
      case "performance":
        content.innerHTML = this.renderPerformanceView();
        this.initializePerformanceCharts();
        break;
      case "maintenance":
        content.innerHTML = this.renderMaintenanceView();
        break;
      default:
        content.innerHTML =
          '<div class="alert alert-error">Unknown view: ' +
          this.currentView +
          "</div>";
    }
  }

  /**
   * Render dashboard view
   */
  renderDashboardView() {
    const metrics = this.data.metrics;
    if (!metrics) {
      return '<div class="alert alert-warning">No metrics data available</div>';
    }

    return `
      <div class="dashboard-grid">
        <div class="metric-card">
          <h3>🚀 Query Performance</h3>
          <div class="metric-value">${metrics.current?.averageLatency?.toFixed(1) || "0"}ms</div>
          <div class="metric-subtitle">Average query latency</div>
          <div class="metric-trend trend-neutral">
            📊 ${metrics.current?.queriesLogged || 0} queries logged
          </div>
        </div>

        <div class="metric-card">
          <h3>💡 Pending Suggestions</h3>
          <div class="metric-value">${this.data.suggestions?.length || 0}</div>
          <div class="metric-subtitle">Optimization opportunities</div>
          <div class="metric-trend trend-up">
            ⚡ Ready for review
          </div>
        </div>

        <div class="metric-card">
          <h3>✅ Applied Optimizations</h3>
          <div class="metric-value">${this.data.applied?.length || 0}</div>
          <div class="metric-subtitle">Successfully applied</div>
          <div class="metric-trend trend-up">
            📈 ${this.data.applied?.filter((opt) => opt.performance_gain > 0).length || 0} with gains
          </div>
        </div>

        <div class="metric-card">
          <h3>🎯 System Health</h3>
          <div class="metric-value" style="font-size: 24px; color: ${this.getHealthColor()}">
            ${this.getHealthIcon()} ${this.data.health || "Unknown"}
          </div>
          <div class="metric-subtitle">Database optimizer status</div>
          <div class="metric-trend trend-neutral">
            🔄 Auto-monitoring ${metrics.config?.monitoring ? "enabled" : "disabled"}
          </div>
        </div>
      </div>

      <div class="chart-container">
        <div class="chart-header">
          <h3 class="chart-title">Query Latency Trend</h3>
          <div class="chart-controls">
            <button class="chart-control active" onclick="this.updateChart('latency', '1h')">1H</button>
            <button class="chart-control" onclick="this.updateChart('latency', '24h')">24H</button>
            <button class="chart-control" onclick="this.updateChart('latency', '7d')">7D</button>
          </div>
        </div>
        <div id="latency-chart" style="height: 300px; background: #f8fafc; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #64748b;">
          📊 Chart will be rendered here
        </div>
      </div>

      <div class="alert alert-info">
        <strong>💡 Quick Actions:</strong>
        View pending suggestions to improve performance, or check the performance tab for detailed analytics.
      </div>
    `;
  }

  /**
   * Render suggestions view
   */
  renderSuggestionsView() {
    if (!this.data.suggestions || this.data.suggestions.length === 0) {
      return `
        <div class="alert alert-success">
          <strong>🎉 No pending suggestions!</strong>
          Your database is well-optimized. New suggestions will appear automatically as query patterns change.
        </div>
      `;
    }

    const suggestionsTable = this.data.suggestions
      .map(
        (suggestion) => `
      <tr>
        <td>${suggestion.table_name}</td>
        <td><code>${suggestion.jsonb_path}</code></td>
        <td><span class="status-badge status-${suggestion.suggestion_type.replace("_", "-")}">${suggestion.suggestion_type}</span></td>
        <td class="text-right">${suggestion.query_frequency || 0}</td>
        <td class="text-right">${(suggestion.avg_query_time || 0).toFixed(1)}ms</td>
        <td class="text-right">${(suggestion.estimated_benefit || 0).toFixed(1)}ms</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-success" onclick="this.applySuggestion('${suggestion.id}')">
              ✅ Apply
            </button>
            <button class="btn btn-sm btn-info" onclick="this.viewSuggestion('${suggestion.id}')">
              👁️ View SQL
            </button>
            <button class="btn btn-sm btn-danger" onclick="this.rejectSuggestion('${suggestion.id}')">
              ❌ Reject
            </button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");

    return `
      <div class="alert alert-info">
        <strong>💡 Optimization Suggestions</strong><br>
        These suggestions are automatically generated based on query patterns. Review and apply them to improve performance.
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Field Path</th>
            <th>Type</th>
            <th>Query Count</th>
            <th>Avg Latency</th>
            <th>Est. Benefit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${suggestionsTable}
        </tbody>
      </table>
    `;
  }

  /**
   * Render applied optimizations view
   */
  renderAppliedView() {
    if (!this.data.applied || this.data.applied.length === 0) {
      return `
        <div class="alert alert-info">
          <strong>📊 No optimizations applied yet</strong><br>
          Applied optimizations will appear here once you approve suggestions.
        </div>
      `;
    }

    const appliedTable = this.data.applied
      .map(
        (opt) => `
      <tr>
        <td>${opt.table_name}</td>
        <td><code>${opt.target_field}</code></td>
        <td><span class="status-badge status-${opt.optimization_type.replace("_", "-")}">${opt.optimization_type}</span></td>
        <td class="text-right">${(opt.avg_latency_before || 0).toFixed(1)}ms</td>
        <td class="text-right">${(opt.avg_latency_after || 0).toFixed(1)}ms</td>
        <td class="text-right ${opt.performance_gain > 0 ? "trend-up" : "trend-neutral"}">
          ${opt.performance_gain ? `${opt.performance_gain.toFixed(1)}%` : "N/A"}
        </td>
        <td>${new Date(opt.applied_at).toLocaleDateString()}</td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-info" onclick="this.viewOptimizationDetails('${opt.id}')">
              👁️ Details
            </button>
            <button class="btn btn-sm btn-danger" onclick="this.rollbackOptimization('${opt.id}')">
              🔄 Rollback
            </button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");

    const totalGain = this.data.applied
      .filter((opt) => opt.performance_gain > 0)
      .reduce((sum, opt) => sum + opt.performance_gain, 0);

    return `
      <div class="alert alert-success">
        <strong>✅ Optimization Impact</strong><br>
        ${this.data.applied.length} optimizations applied with an average performance gain of ${(totalGain / Math.max(this.data.applied.length, 1)).toFixed(1)}%.
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Table</th>
            <th>Field</th>
            <th>Type</th>
            <th>Before</th>
            <th>After</th>
            <th>Gain</th>
            <th>Applied</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${appliedTable}
        </tbody>
      </table>
    `;
  }

  /**
   * Helper methods
   */
  getHealthColor() {
    switch (this.data.health) {
      case "healthy":
        return "#10b981";
      case "idle":
        return "#6b7280";
      case "unhealthy":
        return "#ef4444";
      default:
        return "#f59e0b";
    }
  }

  getHealthIcon() {
    switch (this.data.health) {
      case "healthy":
        return "🟢";
      case "idle":
        return "🟡";
      case "unhealthy":
        return "🔴";
      default:
        return "🟠";
    }
  }

  updateHealthIndicator() {
    const dot = this.container.querySelector("#status-dot");
    const text = this.container.querySelector("#status-text");

    if (dot && text) {
      dot.className = `status-dot ${this.data.health || "warning"}`;
      text.textContent = `System ${this.data.health || "Unknown"}`;
    }
  }

  updateBadges() {
    const suggestionsBadge = this.container.querySelector("#suggestions-badge");
    const appliedBadge = this.container.querySelector("#applied-badge");

    if (suggestionsBadge) {
      suggestionsBadge.textContent = this.data.suggestions?.length || 0;
    }

    if (appliedBadge) {
      appliedBadge.textContent = this.data.applied?.length || 0;
    }
  }

  /**
   * Action handlers
   */
  async applySuggestion(suggestionId) {
    if (!confirm("Are you sure you want to apply this optimization?")) return;

    try {
      await this.optimizer.applyOptimization(suggestionId, "admin_panel");
      this.showSuccess("Optimization applied successfully");
      await this.refreshAllData();
    } catch (error) {
      this.showError("Failed to apply optimization", error.message);
    }
  }

  async rollbackOptimization(optimizationId) {
    if (!confirm("Are you sure you want to rollback this optimization?"))
      return;

    try {
      await this.optimizer.rollbackOptimization(optimizationId);
      this.showSuccess("Optimization rolled back successfully");
      await this.refreshAllData();
    } catch (error) {
      this.showError("Failed to rollback optimization", error.message);
    }
  }

  async refreshAllData() {
    await this.loadAllData();
    this.showSuccess("Data refreshed successfully");
  }

  /**
   * Start real-time updates
   */
  startRealTimeUpdates() {
    this.refreshInterval = setInterval(() => {
      this.loadAllData().catch((err) =>
        console.error("Auto-refresh failed:", err),
      );
    }, this.updateInterval);
  }

  /**
   * Utility methods
   */
  showSuccess(message) {
    this.showNotification(message, "success");
  }

  showError(title, message) {
    this.showNotification(`${title}: ${message}`, "error");
  }

  showNotification(message, type) {
    // Simple notification system
    const notification = document.createElement("div");
    notification.className = `alert alert-${type}`;
    notification.style.cssText =
      "position: fixed; top: 20px; right: 20px; z-index: 10000; min-width: 300px;";
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  // Placeholder methods for additional functionality
  renderPerformanceView() {
    return '<div class="alert alert-info">Performance charts coming soon!</div>';
  }
  renderMaintenanceView() {
    return '<div class="alert alert-info">Maintenance tools coming soon!</div>';
  }
  initializeDashboardCharts() {
    /* Chart initialization */
  }
  initializePerformanceCharts() {
    /* Performance charts */
  }
  updateChart() {
    /* Chart updates */
  }
  viewSuggestion() {
    /* View SQL modal */
  }
  rejectSuggestion() {
    /* Reject suggestion */
  }
  viewOptimizationDetails() {
    /* View details modal */
  }
  exportReport() {
    /* Export functionality */
  }
}

export default DatabaseOptimizationControlPanel;
