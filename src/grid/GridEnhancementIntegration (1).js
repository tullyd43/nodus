/**
 * Grid Enhancement Integration Example
 * Shows how to properly integrate the EnhancedGridRenderer with your existing system
 * Follows the composability principle from your feature development philosophy
 */

import EnhancedGridRenderer from './EnhancedGridRenderer.js';
import EventBus from '../core/EventBus.js';

/**
 * Example: Enhancing the existing MainView with modern grid capabilities
 * This integrates with your existing main-view.js without breaking changes
 */
export class MainViewWithEnhancedGrid {
  constructor(appViewModel) {
    this.appViewModel = appViewModel;
    this.elements = {
      gridContainer: document.querySelector('.grid-container')
    };
    
    // Your existing MainView initialization code would go here
    this.initializeExistingGrid();
    
    // Then enhance with modern capabilities
    this.enhanceGrid();
  }

  initializeExistingGrid() {
    // This represents your existing grid initialization
    // from main-view.js - keeping it intact
    console.log('Initializing existing grid system...');
    
    // Your existing event listeners
    EventBus.on('gridChange', this.renderGrid.bind(this));
    EventBus.on('error', this.handleError.bind(this));
  }

  enhanceGrid() {
    // Add modern enhancements while preserving existing functionality
    this.gridEnhancer = new EnhancedGridRenderer(
      this.elements.gridContainer, 
      this.appViewModel,
      {
        // Hook into HybridStateManager for instant layout persistence
        onLayoutChange: (changeEvent) => {
          console.log('Layout changed:', changeEvent);
          
          // Save to HybridStateManager if available
          if (this.appViewModel.hybridStateManager) {
            this.appViewModel.hybridStateManager.recordOperation({
              type: 'grid_layout_change',
              data: changeEvent
            });
          }
          
          // Optional: Send to analytics
          this.trackLayoutChange(changeEvent);
        },
        
        // Enable accessibility features
        enableKeyboard: true,
        enableAria: true
      }
    );
    
    // Listen for enhancement events
    EventBus.on('gridEnhanced', this.onGridEnhanced.bind(this));
    EventBus.on('blockDragEnd', this.onBlockMoved.bind(this));
    EventBus.on('layoutChanged', this.onLayoutPersisted.bind(this));
    
    console.log('Grid enhanced with modern capabilities');
  }

  // Your existing renderGrid method - unchanged
  renderGrid(gridBlocks) {
    const container = this.elements.gridContainer;
    container.innerHTML = '';

    gridBlocks.forEach(block => {
      const div = document.createElement('div');
      div.classList.add('grid-block');
      div.dataset.blockId = block.blockId;
      
      // Your existing block rendering logic
      div.style.gridColumnStart = block.position.x + 1;
      div.style.gridColumnEnd = block.position.x + block.position.w + 1;
      div.style.gridRowStart = block.position.y + 1;
      div.style.gridRowEnd = block.position.y + block.position.h + 1;

      // Your existing content rendering
      const contentEl = document.createElement('div');
      contentEl.classList.add('block-content');
      
      try {
        const widget = this.renderWidget(block);
        contentEl.appendChild(widget);
      } catch (err) {
        console.error('Widget render error:', err);
        EventBus.emit('error', err);
      }

      div.appendChild(contentEl);

      // Your existing resize handle
      const handle = document.createElement('div');
      handle.classList.add('resize-handle');
      div.appendChild(handle);

      container.appendChild(div);

      // Your existing drag/resize handlers
      this.attachDragHandlers(div, block);
      this.attachResizeHandlers(div, handle, block);
    });

    EventBus.emit('gridRendered', gridBlocks);
  }

  // Your existing methods - enhanced automatically
  attachDragHandlers(div, block) {
    // Your existing drag logic - the enhancer will layer on top
    let startX, startY, origX, origY;
    
    const onMouseDown = e => {
      if (e.target.classList.contains('resize-handle')) return;
      
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origX = block.position.x;
      origY = block.position.y;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = e => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const gridWidth = this.elements.gridContainer.clientWidth;
      const unitWidth = gridWidth / 24;
      const newX = Math.max(0, Math.round(origX + deltaX / unitWidth));
      const newY = Math.max(0, Math.round(origY + deltaY / unitWidth));
      
      block.position.x = newX;
      block.position.y = newY;
      div.style.gridColumnStart = newX + 1;
      div.style.gridRowStart = newY + 1;
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.appViewModel.gridLayoutViewModel.updatePositions([
        { blockId: block.blockId, ...block.position }
      ]);
    };
    
    div.addEventListener('mousedown', onMouseDown);
  }

  attachResizeHandlers(div, handle, block) {
    // Your existing resize logic - enhanced automatically
    let startX, startY, origW, origH;
    
    const onMouseDown = e => {
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origW = block.position.w;
      origH = block.position.h;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    
    const onMouseMove = e => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const gridWidth = this.elements.gridContainer.clientWidth;
      const unitWidth = gridWidth / 24;
      const newW = Math.max(1, Math.round(origW + deltaX / unitWidth));
      const newH = Math.max(1, Math.round(origH + deltaY / unitWidth));
      
      block.position.w = newW;
      block.position.h = newH;
      div.style.gridColumnEnd = block.position.x + 1 + newW;
      div.style.gridRowEnd = block.position.y + 1 + newH;
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      this.appViewModel.gridLayoutViewModel.updatePositions([
        { blockId: block.blockId, ...block.position }
      ]);
    };
    
    handle.addEventListener('mousedown', onMouseDown);
  }

  renderWidget(block) {
    // Your existing widget rendering logic
    const widget = document.createElement('div');
    widget.textContent = `Widget: ${block.component}`;
    return widget;
  }

  // Enhancement event handlers
  onGridEnhanced(data) {
    console.log('Grid enhancement active:', data.renderer);
    
    // Optional: Add performance monitoring UI
    this.showPerformanceIndicator();
  }

  onBlockMoved(data) {
    console.log('Block moved with enhancement:', data.blockId, data.position);
    
    // Optional: Add analytics or audit logging
    this.logBlockMovement(data);
  }

  showPerformanceIndicator() {
    // Optional: Visual indicator that enhancements are active
    const indicator = document.createElement('div');
    indicator.className = 'grid-enhancement-indicator';
    indicator.textContent = 'Enhanced Grid Active';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #2ecc71;
      color: white;
      padding: 5px 10px;
      border-radius: 3px;
      font-size: 12px;
      z-index: 10000;
      opacity: 0.8;
    `;
    document.body.appendChild(indicator);
    
    // Remove after 3 seconds
    setTimeout(() => indicator.remove(), 3000);
  }

  onLayoutPersisted(changeEvent) {
    console.log('Layout persisted:', changeEvent.type, changeEvent.blockId);
    
    // Optional: Show user feedback for layout saves
    if (changeEvent.changeType === 'keyboard_move' || changeEvent.changeType === 'keyboard_resize') {
      this.showAccessibilityFeedback(`Block ${changeEvent.changeType.replace('keyboard_', '')} saved`);
    }
  }

  trackLayoutChange(changeEvent) {
    // Optional: Analytics tracking
    EventBus.emit('analyticsEvent', {
      category: 'grid_interaction',
      action: changeEvent.changeType,
      label: changeEvent.blockId,
      value: 1
    });
  }

  showAccessibilityFeedback(message) {
    // Temporary visual feedback for accessibility actions
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #28a745;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    document.body.appendChild(feedback);
    
    // Fade in
    requestAnimationFrame(() => {
      feedback.style.opacity = '1';
    });
    
    // Remove after 2 seconds
    setTimeout(() => {
      feedback.style.opacity = '0';
      setTimeout(() => feedback.remove(), 300);
    }, 2000);
  }

  // Public API for toggling enhancement
  toggleEnhancement() {
    if (this.gridEnhancer.isEnhanced) {
      this.gridEnhancer.disable();
    } else {
      this.gridEnhancer.enhance();
    }
  }

  handleError(error) {
    // Your existing error handling
    console.error('Grid error:', error);
  }
}

/**
 * Simple integration function for adding to existing app
 * This shows how to add the enhancement without breaking existing code
 */
export function enhanceExistingGrid(appViewModel, options = {}) {
  const gridContainer = document.querySelector('.grid-container');
  if (!gridContainer) {
    console.warn('Grid container not found - enhancement skipped');
    return null;
  }

  const enhancer = new EnhancedGridRenderer(gridContainer, appViewModel, {
    // Default persistence to HybridStateManager
    onLayoutChange: (changeEvent) => {
      if (appViewModel.hybridStateManager) {
        appViewModel.hybridStateManager.recordOperation({
          type: 'grid_layout_change',
          data: changeEvent
        });
      }
    },
    
    // Enable accessibility by default
    enableKeyboard: true,
    enableAria: true,
    
    // Allow custom options to override
    ...options
  });
  
  // Optional: Add toggle button to existing UI
  if (!options.hideToggle) {
    addEnhancementToggle(enhancer);
  }
  
  return enhancer;
}

function addEnhancementToggle(enhancer) {
  const toggle = document.createElement('button');
  toggle.textContent = 'Toggle Grid Enhancement';
  toggle.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #3498db;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    z-index: 1000;
  `;
  
  toggle.addEventListener('click', () => {
    if (enhancer.isEnhanced) {
      enhancer.disable();
      toggle.textContent = 'Enable Grid Enhancement';
    } else {
      enhancer.enhance();
      toggle.textContent = 'Disable Grid Enhancement';
    }
  });
  
  document.body.appendChild(toggle);
}

// Example usage in your existing app.js or main initialization:
/*
import { enhanceExistingGrid } from './GridEnhancementIntegration.js';

// After your existing app initialization
const gridEnhancer = enhanceExistingGrid(appViewModel);

// Or if you want full control:
const mainView = new MainViewWithEnhancedGrid(appViewModel);
*/

export default MainViewWithEnhancedGrid;
