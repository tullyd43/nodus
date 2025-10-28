/**
 * Toast Notification System for Grid Layout Persistence
 * Lightweight, accessible toast notifications that integrate with existing EventBus
 */

export class GridToastManager {
  constructor() {
    this.toasts = new Map();
    this.container = null;
    this.maxToasts = 3;
    this.defaultDuration = 2500;
    
    this.setupContainer();
    this.setupEventListeners();
  }

  setupContainer() {
    // Create toast container if it doesn't exist
    this.container = document.getElementById('grid-toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'grid-toast-container';
      this.container.className = 'grid-toast-container';
      this.container.setAttribute('aria-live', 'polite');
      this.container.setAttribute('aria-label', 'Grid notifications');
      
      // Position container
      this.container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        max-width: 300px;
      `;
      
      document.body.appendChild(this.container);
    }
  }

  setupEventListeners() {
    // Listen for layout changes to show save feedback
    if (typeof EventBus !== 'undefined') {
      EventBus.on('layoutChanged', this.onLayoutChanged.bind(this));
      EventBus.on('gridPerformanceMode', this.onPerformanceModeChanged.bind(this));
    }
  }

  onLayoutChanged(changeEvent) {
    // Check policy to see if we should show feedback
    try {
      const context = this.getContext();
      if (!context || !this.shouldShowSaveFeedback(context)) {
        return;
      }

      // Show different messages based on change type
      const messages = {
        'drag': '📍 Layout saved',
        'resize': '📏 Layout saved', 
        'keyboard_move': '⌨️ Position saved',
        'keyboard_resize': '⌨️ Size saved',
        'add': '➕ Block added',
        'remove': '➖ Block removed'
      };

      const message = messages[changeEvent.changeType] || '💾 Layout saved';
      this.showToast(message, 'success', 2000);

    } catch (error) {
      console.warn('Toast notification error:', error);
    }
  }

  onPerformanceModeChanged(data) {
    if (data.reason === 'policy_override') {
      const message = data.enabled 
        ? '🚀 Performance mode enabled' 
        : '✨ Full features enabled';
      this.showToast(message, 'info', 3000);
    }
  }

  shouldShowSaveFeedback(context) {
    // Check policy or use default
    try {
      return context.getBooleanPolicy?.('system', 'grid_save_feedback', true) ?? true;
    } catch (error) {
      return true; // Default to showing feedback
    }
  }

  getContext() {
    // Try to get context from global app or window
    return window.appViewModel?.context || null;
  }

  showToast(message, type = 'info', duration = null) {
    const id = Date.now().toString();
    const toast = this.createToast(id, message, type);
    
    // Add to container
    this.container.appendChild(toast);
    this.toasts.set(id, { element: toast, type });
    
    // Limit number of toasts
    this.enforceMaxToasts();
    
    // Auto-remove after duration
    const actualDuration = duration || this.defaultDuration;
    setTimeout(() => {
      this.removeToast(id);
    }, actualDuration);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });

    return id;
  }

  createToast(id, message, type) {
    const toast = document.createElement('div');
    toast.className = `grid-toast grid-toast-${type}`;
    toast.setAttribute('data-toast-id', id);
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-atomic', 'true');
    
    // Set initial styles for animation
    toast.style.cssText = `
      background: ${this.getBackgroundColor(type)};
      color: ${this.getTextColor(type)};
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border-left: 4px solid ${this.getBorderColor(type)};
      transform: translateX(100%);
      opacity: 0;
      transition: all 0.3s ease;
      pointer-events: auto;
      cursor: pointer;
      user-select: none;
      position: relative;
      overflow: hidden;
    `;
    
    // Add content
    const content = document.createElement('div');
    content.textContent = message;
    toast.appendChild(content);
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.style.cssText = `
      position: absolute;
      top: 4px;
      right: 8px;
      background: none;
      border: none;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.7;
      line-height: 1;
    `;
    
    closeBtn.addEventListener('click', () => {
      this.removeToast(id);
    });
    
    toast.appendChild(closeBtn);
    
    // Click to dismiss
    toast.addEventListener('click', (e) => {
      if (e.target !== closeBtn) {
        this.removeToast(id);
      }
    });
    
    return toast;
  }

  getBackgroundColor(type) {
    const colors = {
      success: '#d4edda',
      error: '#f8d7da', 
      warning: '#fff3cd',
      info: '#d1ecf1'
    };
    return colors[type] || colors.info;
  }

  getTextColor(type) {
    const colors = {
      success: '#155724',
      error: '#721c24',
      warning: '#856404', 
      info: '#0c5460'
    };
    return colors[type] || colors.info;
  }

  getBorderColor(type) {
    const colors = {
      success: '#28a745',
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    };
    return colors[type] || colors.info;
  }

  removeToast(id) {
    const toast = this.toasts.get(id);
    if (!toast) return;
    
    const element = toast.element;
    
    // Animate out
    element.style.transform = 'translateX(100%)';
    element.style.opacity = '0';
    
    // Remove from DOM after animation
    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.toasts.delete(id);
    }, 300);
  }

  enforceMaxToasts() {
    const toastIds = Array.from(this.toasts.keys());
    if (toastIds.length > this.maxToasts) {
      // Remove oldest toasts
      const toRemove = toastIds.slice(0, toastIds.length - this.maxToasts);
      toRemove.forEach(id => this.removeToast(id));
    }
  }

  // Public API
  success(message, duration) {
    return this.showToast(message, 'success', duration);
  }

  error(message, duration) {
    return this.showToast(message, 'error', duration);
  }

  warning(message, duration) {
    return this.showToast(message, 'warning', duration);
  }

  info(message, duration) {
    return this.showToast(message, 'info', duration);
  }

  clear() {
    Array.from(this.toasts.keys()).forEach(id => this.removeToast(id));
  }

  destroy() {
    this.clear();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

// Singleton instance
let toastManager = null;

export function getToastManager() {
  if (!toastManager) {
    toastManager = new GridToastManager();
  }
  return toastManager;
}

// Convenience functions
export function showGridToast(message, type = 'info', duration = null) {
  return getToastManager().showToast(message, type, duration);
}

export function showLayoutSaved(changeType = 'change') {
  const messages = {
    'drag': '📍 Layout saved',
    'resize': '📏 Layout saved',
    'keyboard_move': '⌨️ Position saved', 
    'keyboard_resize': '⌨️ Size saved',
    'change': '💾 Layout saved'
  };
  
  const message = messages[changeType] || messages.change;
  return getToastManager().success(message, 2000);
}

export default GridToastManager;
