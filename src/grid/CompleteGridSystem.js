/**
 * Complete Grid Enhancement Integration
 * Shows all features working together: policies, toasts, AI assistant, accessibility
 */

import EnhancedGridRenderer from './EnhancedGridRenderer.js';
import GridPolicyHelper, { extendSystemPoliciesWithGrid } from './GridPolicyIntegration.js';
import { getToastManager } from './GridToastManager.js';
import AILayoutAssistant from './AILayoutAssistant.js';
import EventBus from '../core/EventBus.js';

/**
 * Complete enhanced grid system with all optional features
 */
export class CompleteGridSystem {
  constructor(appViewModel, options = {}) {
    this.appViewModel = appViewModel;
    this.options = {
      gridContainer: '.grid-container',
      enablePolicies: true,
      enableToasts: true,
      enableAI: false, // Future feature
      enableAnalytics: true,
      ...options
    };

    this.gridEnhancer = null;
    this.toastManager = null;
    this.aiAssistant = null;
    this.initialized = false;

    this.init();
  }

  async init() {
    try {
      // 1. Extend SystemPolicies with grid policies
      if (this.options.enablePolicies) {
        extendSystemPoliciesWithGrid();
      }

      // 2. Initialize toast manager
      if (this.options.enableToasts) {
        this.toastManager = getToastManager();
      }

      // 3. Initialize AI assistant if enabled
      if (this.options.enableAI && this.appViewModel.hybridStateManager) {
        this.aiAssistant = new AILayoutAssistant(this.appViewModel.hybridStateManager);
      }

      // 4. Initialize grid enhancer with all features
      await this.initializeGridEnhancer();

      // 5. Set up policy management UI
      this.setupPolicyControls();

      // 6. Set up analytics tracking
      if (this.options.enableAnalytics) {
        this.setupAnalytics();
      }

      this.initialized = true;
      console.log('Complete Grid System initialized with all features');

      // Show initialization success
      if (this.toastManager) {
        this.toastManager.success('🎯 Enhanced grid system ready', 3000);
      }

    } catch (error) {
      console.error('Failed to initialize complete grid system:', error);
      
      if (this.toastManager) {
        this.toastManager.error('Failed to initialize grid enhancements', 5000);
      }
    }
  }

  async initializeGridEnhancer() {
    const container = document.querySelector(this.options.gridContainer);
    if (!container) {
      throw new Error('Grid container not found');
    }

    this.gridEnhancer = new EnhancedGridRenderer(container, this.appViewModel, {
      // Persistence with policy awareness
      onLayoutChange: (changeEvent) => {
        this.onLayoutChanged(changeEvent);
      },

      // Accessibility features
      enableKeyboard: true,
      enableAria: true,

      // Toast notifications
      enableToasts: this.options.enableToasts,

      // AI features (future)
      enableAI: this.options.enableAI
    });

    // Listen for grid events
    EventBus.on('gridEnhanced', this.onGridEnhanced.bind(this));
    EventBus.on('gridPerformanceMode', this.onPerformanceModeChanged.bind(this));
    
    if (this.options.enableAI) {
      EventBus.on('aiLayoutSuggestions', this.onAISuggestions.bind(this));
    }
  }

  onLayoutChanged(changeEvent) {
    // Save to HybridStateManager
    if (this.appViewModel.hybridStateManager) {
      this.appViewModel.hybridStateManager.recordOperation({
        type: 'grid_layout_change',
        data: changeEvent
      });
    }

    // Track analytics
    if (this.options.enableAnalytics) {
      this.trackLayoutChange(changeEvent);
    }

    // Feed to AI assistant for pattern learning
    if (this.aiAssistant) {
      // AI assistant listens to layoutChanged events automatically
    }
  }

  onGridEnhanced(data) {
    console.log('Grid enhancement active');
    
    // Show current policy status
    this.showPolicyStatus();
  }

  onPerformanceModeChanged(data) {
    console.log('Performance mode changed:', data);
    
    // Could update UI indicators, analytics, etc.
    if (this.options.enableAnalytics) {
      this.trackPerformanceMode(data);
    }
  }

  onAISuggestions(data) {
    console.log('AI suggestions received:', data.suggestions);
    
    // Show suggestions in UI (future implementation)
    if (this.toastManager) {
      this.toastManager.info(
        `💡 ${data.suggestions.length} layout suggestions available`,
        5000
      );
    }
  }

  setupPolicyControls() {
    // Add policy control panel to page
    const controlPanel = this.createPolicyControlPanel();
    
    // Find a good place to insert it (or create a floating panel)
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.appendChild(controlPanel);
    } else {
      // Create floating panel
      controlPanel.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        padding: 16px;
        z-index: 1000;
        max-width: 250px;
      `;
      document.body.appendChild(controlPanel);
    }
  }

  createPolicyControlPanel() {
    const panel = document.createElement('div');
    panel.className = 'grid-policy-panel';
    panel.innerHTML = `
      <h4>Grid Settings</h4>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="perf-mode-toggle"> 
          Performance Mode
        </label>
        <small>Override automatic FPS-based switching</small>
      </div>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="auto-save-toggle" checked> 
          Auto-save Layouts
        </label>
      </div>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="save-feedback-toggle" checked> 
          Save Notifications
        </label>
      </div>
      
      <div class="policy-control">
        <label>
          <input type="checkbox" id="ai-suggestions-toggle"> 
          AI Suggestions <span class="badge">Future</span>
        </label>
      </div>
      
      <button id="reset-policies" class="btn-secondary">Reset to Defaults</button>
    `;

    // Add event listeners
    this.setupPolicyEventListeners(panel);
    
    // Load current policy states
    this.loadCurrentPolicyStates(panel);

    return panel;
  }

  setupPolicyEventListeners(panel) {
    const perfModeToggle = panel.querySelector('#perf-mode-toggle');
    const autoSaveToggle = panel.querySelector('#auto-save-toggle');
    const saveFeedbackToggle = panel.querySelector('#save-feedback-toggle');
    const aiSuggestionsToggle = panel.querySelector('#ai-suggestions-toggle');
    const resetButton = panel.querySelector('#reset-policies');

    perfModeToggle.addEventListener('change', async (e) => {
      const mode = e.target.checked ? true : null; // true = force on, null = auto
      await this.setPolicyWithFeedback('system.grid_performance_mode', mode);
    });

    autoSaveToggle.addEventListener('change', async (e) => {
      await this.setPolicyWithFeedback('system.grid_auto_save_layouts', e.target.checked);
    });

    saveFeedbackToggle.addEventListener('change', async (e) => {
      await this.setPolicyWithFeedback('system.grid_save_feedback', e.target.checked);
    });

    aiSuggestionsToggle.addEventListener('change', async (e) => {
      await this.setPolicyWithFeedback('system.grid_ai_suggestions', e.target.checked);
      
      if (e.target.checked && !this.aiAssistant) {
        // Initialize AI assistant when enabled
        this.aiAssistant = new AILayoutAssistant(this.appViewModel.hybridStateManager);
      }
    });

    resetButton.addEventListener('click', () => {
      this.resetPolicyDefaults();
    });
  }

  async setPolicyWithFeedback(policyKey, value) {
    try {
      // Use GridPolicyHelper or direct context access
      await this.appViewModel.context.setPolicy('system', policyKey.split('.')[1], value);
      
      if (this.toastManager) {
        this.toastManager.success(`Policy updated: ${policyKey}`, 2000);
      }
    } catch (error) {
      console.error('Failed to set policy:', error);
      
      if (this.toastManager) {
        this.toastManager.error(`Failed to update policy: ${policyKey}`, 3000);
      }
    }
  }

  loadCurrentPolicyStates(panel) {
    try {
      const policies = GridPolicyHelper.getGridPolicies(this.appViewModel?.context);
      
      panel.querySelector('#perf-mode-toggle').checked = policies.performanceMode === true;
      panel.querySelector('#auto-save-toggle').checked = policies.autoSave;
      panel.querySelector('#save-feedback-toggle').checked = policies.saveFeedback;
      panel.querySelector('#ai-suggestions-toggle').checked = policies.aiSuggestions;
      
    } catch (error) {
      console.warn('Could not load current policy states:', error);
    }
  }

  showPolicyStatus() {
    try {
      const policies = GridPolicyHelper.getGridPolicies(this.appViewModel?.context);
      
      console.log('Current Grid Policies:', policies);
      
      if (this.toastManager) {
        const statusMessages = [];
        if (policies.performanceMode === true) statusMessages.push('🚀 Performance mode forced');
        if (policies.performanceMode === false) statusMessages.push('✨ Full features forced');
        if (!policies.autoSave) statusMessages.push('⚠️ Auto-save disabled');
        if (policies.aiSuggestions) statusMessages.push('🤖 AI suggestions enabled');
        
        if (statusMessages.length > 0) {
          this.toastManager.info(statusMessages.join(' • '), 4000);
        }
      }
    } catch (error) {
      console.warn('Could not show policy status:', error);
    }
  }

  setupAnalytics() {
    // Track grid usage patterns
    EventBus.on('layoutChanged', (data) => {
      this.trackLayoutChange(data);
    });

    EventBus.on('gridPerformanceMode', (data) => {
      this.trackPerformanceMode(data);
    });

    EventBus.on('policyChanged', (data) => {
      if (data.domain === 'system' && data.key.startsWith('grid_')) {
        this.trackPolicyChange(data);
      }
    });
  }

  trackLayoutChange(changeEvent) {
    // Analytics tracking for layout changes
    const analyticsEvent = {
      category: 'grid_interaction',
      action: changeEvent.changeType,
      label: changeEvent.blockId,
      value: 1,
      customDimensions: {
        userId: changeEvent.userId,
        autoSaved: changeEvent.autoSaved,
        position: `${changeEvent.position.x},${changeEvent.position.y}`,
        size: `${changeEvent.position.w}x${changeEvent.position.h}`
      }
    };

    // Emit for analytics system
    EventBus.emit('analyticsEvent', analyticsEvent);
  }

  trackPerformanceMode(data) {
    EventBus.emit('analyticsEvent', {
      category: 'grid_performance',
      action: data.enabled ? 'performance_mode_on' : 'performance_mode_off',
      label: data.reason,
      value: data.fps || 0
    });
  }

  trackPolicyChange(data) {
    EventBus.emit('analyticsEvent', {
      category: 'grid_policy',
      action: 'policy_changed',
      label: data.key,
      value: data.value ? 1 : 0
    });
  }

  resetPolicyDefaults() {
    // Reset all grid policies to defaults
    const defaults = {
      'grid_performance_mode': null,
      'grid_auto_save_layouts': true,
      'grid_save_feedback': true,
      'grid_ai_suggestions': false
    };

    Object.entries(defaults).forEach(async ([key, value]) => {
      await this.setPolicyWithFeedback(`system.${key}`, value);
    });

    if (this.toastManager) {
      this.toastManager.success('Grid policies reset to defaults', 3000);
    }
  }

  // Public API
  
  getGridEnhancer() {
    return this.gridEnhancer;
  }

  getToastManager() {
    return this.toastManager;
  }

  getAIAssistant() {
    return this.aiAssistant;
  }

  isInitialized() {
    return this.initialized;
  }

  destroy() {
    if (this.gridEnhancer) {
      this.gridEnhancer.disable();
    }
    
    if (this.toastManager) {
      this.toastManager.destroy();
    }
    
    // Remove event listeners
    EventBus.off('gridEnhanced', this.onGridEnhanced);
    EventBus.off('gridPerformanceMode', this.onPerformanceModeChanged);
    EventBus.off('aiLayoutSuggestions', this.onAISuggestions);
  }
}

// Convenience function for easy setup
export async function initializeCompleteGridSystem(appViewModel, options = {}) {
  const system = new CompleteGridSystem(appViewModel, options);
  return system;
}

export default CompleteGridSystem;
