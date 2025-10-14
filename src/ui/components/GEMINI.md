# Component Development Guide
**AI Agent Context for Web Component Creation**

<!-- AUTO-SYNC-METADATA -->
**🤖 AI Agent Context - Auto-Updated**
- **Last Sync:** 2024-10-13T16:00:00Z
- **Git Commit:** latest
- **Changes:** Component architecture patterns established
- **Arch Impact:** high - comprehensive component guidelines
- **Modified Files:** 1
<!-- /AUTO-SYNC-METADATA -->

---

## Core Architecture Principles

### Event/Item Dichotomy
**Everything is either an Event (verb) or an Item (noun).** This fundamental principle drives all component design decisions.

```javascript
// ✅ CORRECT - Component respects the dichotomy
class EntityCard extends Component {
  render() {
    const { entity } = this.props;
    const isEvent = entity.involves_action;
    
    return `
      <div class="entity-card ${isEvent ? 'entity-card--event' : 'entity-card--item'}">
        ${isEvent ? this.renderEventContent() : this.renderItemContent()}
      </div>
    `;
  }
}

// ❌ WRONG - Component doesn't distinguish between Events and Items
class GenericCard extends Component {
  // Missing entity type awareness
}
```

### MVVM Component Architecture
Components must follow the strict MVVM pattern with proper separation of concerns.

```javascript
// ✅ CORRECT - MVVM Component Structure
class EventListComponent {
  constructor(parentElement, eventViewModel) {
    this.parentElement = parentElement;
    this.viewModel = eventViewModel;
    this.state = new ObservableState();
    
    this.bindEvents();
    this.observeViewModelChanges();
    this.initializeSecurityContext();
    this.initializeAccessibilityFeatures();
  }
  
  // View logic only - no business logic
  render() {
    const events = this.viewModel.getFilteredEvents();
    return this.renderEventList(events);
  }
  
  // ViewModel interaction
  async handleCreateEvent(eventData) {
    try {
      await this.viewModel.createEvent(eventData);
      this.logUserAction('event_created', { entity_type: 'event' });
    } catch (error) {
      this.handleError(error);
      this.logSecurityEvent('event_creation_failed', error);
    }
  }
}
```

---

## Security Implementation

### Input Validation & Sanitization
**CRITICAL:** All user input must be validated and sanitized before processing.

```javascript
class SecureFormComponent {
  validateAndSanitize(input, fieldDefinition) {
    // 1. Input validation
    const validator = new InputValidator(fieldDefinition);
    if (!validator.isValid(input)) {
      throw new ValidationError(validator.getErrors());
    }
    
    // 2. XSS prevention
    const sanitized = this.sanitizer.sanitize(input, {
      allowedTags: [], // No HTML by default
      stripIgnoreTag: true
    });
    
    // 3. Audit logging
    this.auditLogger.log('input_processed', {
      field_name: fieldDefinition.name,
      data_classification: fieldDefinition.classification || 'internal',
      input_length: input.length,
      sanitized_length: sanitized.length
    });
    
    return sanitized;
  }
  
  handleFileUpload(file) {
    // File security validation
    if (!this.isFileTypeAllowed(file.type)) {
      throw new SecurityError('File type not allowed');
    }
    
    if (file.size > this.MAX_FILE_SIZE) {
      throw new ValidationError('File size exceeded');
    }
    
    // Log file upload attempt
    this.securityLogger.log('file_upload_attempt', {
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      user_id: this.getCurrentUserId()
    });
  }
}
```

### Authentication & Authorization
Components must respect user permissions and authentication state.

```javascript
class ProtectedComponent {
  constructor(requiredPermissions = []) {
    this.requiredPermissions = requiredPermissions;
    this.authService = new AuthenticationService();
    this.authzService = new AuthorizationService();
    
    this.validateAccess();
  }
  
  async validateAccess() {
    // Check authentication
    if (!this.authService.isAuthenticated()) {
      throw new AuthenticationError('User not authenticated');
    }
    
    // Check authorization for each required permission
    for (const permission of this.requiredPermissions) {
      const authorized = await this.authzService.checkPermission(
        this.getCurrentUserId(),
        permission.operation,
        permission.resource
      );
      
      if (!authorized.authorized) {
        this.logSecurityEvent('unauthorized_access_attempt', {
          permission: permission,
          reason: authorized.reason
        });
        throw new AuthorizationError(`Access denied: ${authorized.reason}`);
      }
    }
  }
  
  async performSecureOperation(operation, data) {
    // Log operation attempt
    this.auditLogger.log('operation_attempt', {
      operation: operation,
      user_id: this.getCurrentUserId(),
      data_classification: this.classifyData(data),
      timestamp: new Date().toISOString()
    });
    
    try {
      const result = await this.executeOperation(operation, data);
      
      // Log successful operation
      this.auditLogger.log('operation_success', {
        operation: operation,
        result_size: JSON.stringify(result).length
      });
      
      return result;
    } catch (error) {
      // Log operation failure
      this.auditLogger.log('operation_failure', {
        operation: operation,
        error_message: error.message,
        error_type: error.constructor.name
      });
      throw error;
    }
  }
}
```

---

## Logging & Auditing

### Comprehensive Activity Logging
All component actions must be logged for security and compliance.

```javascript
class AuditableComponent {
  constructor() {
    this.auditLogger = new AuditLogger({
      component: this.constructor.name,
      user_id: this.getCurrentUserId(),
      session_id: this.getSessionId()
    });
    
    this.performanceMonitor = new PerformanceMonitor();
  }
  
  async performAuditableAction(actionType, data, classification = 'internal') {
    const auditEntry = {
      audit_id: this.generateAuditId(),
      user_id: this.getCurrentUserId(),
      action_type: actionType,
      entity_type: data.entity_type || 'unknown',
      entity_id: data.entity_id || null,
      data_classification: classification,
      timestamp: new Date().toISOString(),
      ip_address: this.getClientIP(),
      user_agent: navigator.userAgent,
      session_id: this.getSessionId(),
      component_name: this.constructor.name
    };
    
    // Performance monitoring
    const startTime = performance.now();
    
    try {
      const result = await this.executeAction(actionType, data);
      
      // Record successful audit entry
      auditEntry.success = true;
      auditEntry.duration_ms = performance.now() - startTime;
      auditEntry.result_hash = await this.hashResult(result);
      
      await this.auditLogger.record(auditEntry);
      
      return result;
    } catch (error) {
      // Record failed audit entry
      auditEntry.success = false;
      auditEntry.error_message = error.message;
      auditEntry.error_type = error.constructor.name;
      auditEntry.duration_ms = performance.now() - startTime;
      
      await this.auditLogger.record(auditEntry);
      
      // Trigger security monitoring for suspicious failures
      if (this.isSuspiciousFailure(error)) {
        await this.triggerSecurityAlert(auditEntry, error);
      }
      
      throw error;
    }
  }
  
  logUserInteraction(interactionType, elementInfo) {
    this.auditLogger.record({
      action_type: 'user_interaction',
      interaction_type: interactionType,
      element_info: {
        element_type: elementInfo.tagName,
        element_id: elementInfo.id,
        element_classes: elementInfo.className,
        element_text: elementInfo.textContent?.substring(0, 100)
      },
      timestamp: new Date().toISOString()
    });
  }
}
```

### Performance & Error Logging
```javascript
class PerformanceAwareComponent {
  async renderWithMonitoring() {
    const renderMetrics = await this.performanceMonitor.timeOperation(
      `${this.constructor.name}_render`,
      async () => {
        return await this.render();
      }
    );
    
    // Log slow renders for optimization
    if (renderMetrics.duration > 100) {
      this.performanceLogger.warn('slow_render', {
        component: this.constructor.name,
        duration: renderMetrics.duration,
        element_count: this.getElementCount(),
        data_size: this.getDataSize()
      });
    }
  }
  
  handleError(error, context = {}) {
    const errorEntry = {
      error_id: this.generateErrorId(),
      error_type: error.constructor.name,
      error_message: error.message,
      error_stack: error.stack,
      component: this.constructor.name,
      context: context,
      user_id: this.getCurrentUserId(),
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      url: window.location.href
    };
    
    this.errorLogger.log(errorEntry);
    
    // Show user-friendly error message
    this.showUserFriendlyError(error);
  }
}
```

---

## Web Accessibility Implementation

### ARIA Support & Keyboard Navigation
All components must be fully accessible to users with disabilities.

```javascript
class AccessibleComponent {
  constructor() {
    this.setupAccessibilityFeatures();
    this.keyboardManager = new KeyboardNavigationManager();
  }
  
  setupAccessibilityFeatures() {
    // ARIA attributes
    this.element.setAttribute('role', this.getAriaRole());
    this.element.setAttribute('aria-label', this.getAriaLabel());
    this.element.setAttribute('aria-describedby', this.getAriaDescription());
    
    // Keyboard navigation
    this.setupKeyboardNavigation();
    
    // Screen reader support
    this.setupScreenReaderSupport();
    
    // Focus management
    this.setupFocusManagement();
  }
  
  setupKeyboardNavigation() {
    this.element.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'Enter':
        case ' ':
          this.handleActivation(event);
          break;
        case 'Escape':
          this.handleEscape(event);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          this.handleArrowNavigation(event);
          break;
        case 'Tab':
          this.handleTabNavigation(event);
          break;
      }
    });
  }
  
  announceToScreenReader(message, priority = 'polite') {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }
  
  validateColorContrast() {
    // Ensure WCAG 2.1 AA compliance
    const foreground = this.getForegroundColor();
    const background = this.getBackgroundColor();
    const contrastRatio = this.calculateContrastRatio(foreground, background);
    
    if (contrastRatio < 4.5) {
      console.warn(`Low contrast ratio detected: ${contrastRatio}. Minimum is 4.5:1`);
    }
  }
}
```

### Semantic HTML & ARIA Patterns
```javascript
class ListComponent extends AccessibleComponent {
  render() {
    const items = this.viewModel.getItems();
    
    return `
      <div class="list-container" 
           role="region" 
           aria-label="Event List"
           aria-live="polite"
           aria-busy="${this.viewModel.isLoading}">
        
        <ul role="list" aria-label="${items.length} events">
          ${items.map((item, index) => `
            <li role="listitem" 
                tabindex="0"
                aria-posinset="${index + 1}"
                aria-setsize="${items.length}"
                aria-selected="${this.isSelected(item)}"
                aria-describedby="item-${item.id}-description">
              
              <h3 id="item-${item.id}-title">${this.escapeHtml(item.title)}</h3>
              <p id="item-${item.id}-description">${this.escapeHtml(item.description)}</p>
              
              <button aria-label="Edit ${item.title}"
                      aria-describedby="item-${item.id}-title"
                      onclick="this.handleEdit('${item.id}')">
                <span aria-hidden="true">✏️</span>
                Edit
              </button>
            </li>
          `).join('')}
        </ul>
        
        <div class="sr-only" aria-live="assertive" id="status-updates"></div>
      </div>
    `;
  }
}
```

---

## API Compatibility & Data Integration

### RESTful API Integration
Components must integrate seamlessly with the RESTful API following established patterns.

```javascript
class APICompatibleComponent {
  constructor() {
    this.apiClient = new APIClient({
      baseURL: '/api/v1',
      timeout: 10000,
      retries: 3
    });
    
    this.syncManager = new SynchronizationManager();
  }
  
  async loadData(endpoint, params = {}) {
    try {
      // Check local cache first (offline-first)
      const cachedData = await this.getCachedData(endpoint, params);
      if (cachedData && !this.shouldRefresh(cachedData)) {
        this.updateUI(cachedData);
        return cachedData;
      }
      
      // Fetch from API with proper error handling
      const response = await this.apiClient.get(endpoint, {
        params: {
          ...params,
          fields: this.getRequiredFields(), // Sparse fieldsets
          include: this.getRequiredIncludes() // Related data
        },
        headers: {
          'Authorization': `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json',
          'X-Client-Version': this.getClientVersion()
        }
      });
      
      // Update local cache
      await this.updateCache(endpoint, params, response.data);
      
      // Update UI
      this.updateUI(response.data);
      
      // Log successful API call
      this.logAPICall('success', endpoint, response.status);
      
      return response.data;
      
    } catch (error) {
      // Handle API errors gracefully
      if (error.status === 401) {
        await this.handleAuthenticationError();
      } else if (error.status === 403) {
        this.handleAuthorizationError();
      } else if (error.status >= 500) {
        this.handleServerError(error);
      }
      
      // Log API error
      this.logAPICall('error', endpoint, error.status, error.message);
      
      // Fallback to cached data if available
      const fallbackData = await this.getCachedData(endpoint, params);
      if (fallbackData) {
        this.updateUI(fallbackData);
        this.showOfflineIndicator();
        return fallbackData;
      }
      
      throw error;
    }
  }
  
  async saveData(data, options = {}) {
    // Optimistic update
    this.updateUI(data);
    
    try {
      // Save to local storage first (offline-first)
      await this.saveToLocal(data);
      
      // Queue for server sync
      await this.syncManager.queueOperation({
        operation: options.method || 'POST',
        endpoint: options.endpoint,
        data: data,
        entity_type: data.entity_type,
        entity_id: data.entity_id
      });
      
      // Attempt immediate sync if online
      if (navigator.onLine) {
        await this.syncManager.processQueue();
      }
      
    } catch (error) {
      // Revert optimistic update
      this.revertUI();
      throw error;
    }
  }
}
```

### Universal Systems Integration
Components must integrate with the universal systems (tags, custom fields, collections, links).

```javascript
class UniversalSystemsComponent {
  async renderWithUniversalSystems(entity) {
    // Load universal system data
    const [tags, customFields, collections, links] = await Promise.all([
      this.loadEntityTags(entity.entity_type, entity.entity_id),
      this.loadEntityCustomFields(entity.entity_type, entity.entity_id),
      this.loadEntityCollections(entity.entity_type, entity.entity_id),
      this.loadEntityLinks(entity.entity_type, entity.entity_id)
    ]);
    
    return `
      <div class="entity-container">
        ${this.renderEntityCore(entity)}
        ${this.renderTags(tags)}
        ${this.renderCustomFields(customFields)}
        ${this.renderCollections(collections)}
        ${this.renderRelationships(links)}
      </div>
    `;
  }
  
  async handleTagAssignment(entityId, entityType, tagNames) {
    // Validate permissions
    await this.validateTaggingPermission(entityType, entityId);
    
    // Process tags through Universal Tag System
    const tagAssignments = await this.tagService.assignTagsFromNames(
      this.getCurrentUserId(),
      entityType,
      entityId,
      tagNames
    );
    
    // Log tag assignment
    this.auditLogger.log('tags_assigned', {
      entity_type: entityType,
      entity_id: entityId,
      tag_names: tagNames,
      assignment_count: tagAssignments.length
    });
    
    // Update UI reactively
    this.updateTagDisplay(tagAssignments);
  }
  
  async handleCustomFieldUpdate(entityId, entityType, fieldName, fieldValue) {
    // Get field definition for validation
    const fieldDef = await this.getFieldDefinition(entityType, fieldName);
    
    // Validate field value
    const validatedValue = this.validateCustomField(fieldValue, fieldDef);
    
    // Update through Universal Field System
    await this.customFieldService.updateField(
      entityType,
      entityId,
      fieldName,
      validatedValue
    );
    
    // Log field update
    this.auditLogger.log('custom_field_updated', {
      entity_type: entityType,
      entity_id: entityId,
      field_name: fieldName,
      field_type: fieldDef.field_type,
      data_classification: fieldDef.classification
    });
  }
}
```

---

## Performance Optimization

### Virtual Scrolling & Lazy Loading
Components handling large datasets must implement performance optimizations.

```javascript
class VirtualScrollComponent {
  constructor(options = {}) {
    this.itemHeight = options.itemHeight || 50;
    this.containerHeight = options.containerHeight || 400;
    this.buffer = options.buffer || 10;
    this.visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
    
    this.scrollTop = 0;
    this.startIndex = 0;
    this.endIndex = this.visibleCount;
    
    this.setupVirtualScrolling();
  }
  
  setupVirtualScrolling() {
    this.container.addEventListener('scroll', this.handleScroll.bind(this));
    
    // Intersection Observer for lazy loading
    this.intersectionObserver = new IntersectionObserver(
      this.handleIntersection.bind(this),
      { threshold: 0.1, rootMargin: '50px' }
    );
  }
  
  async handleScroll(event) {
    const scrollTop = event.target.scrollTop;
    const startIndex = Math.floor(scrollTop / this.itemHeight);
    const endIndex = Math.min(
      startIndex + this.visibleCount + this.buffer,
      this.totalItems
    );
    
    // Only re-render if visible range changed
    if (startIndex !== this.startIndex || endIndex !== this.endIndex) {
      this.startIndex = Math.max(0, startIndex - this.buffer);
      this.endIndex = endIndex;
      
      // Load data for visible range
      await this.loadVisibleData();
      
      // Update virtual scrolling container
      this.updateVirtualContainer();
      
      // Performance logging
      this.logScrollPerformance({
        start_index: this.startIndex,
        end_index: this.endIndex,
        total_items: this.totalItems
      });
    }
  }
  
  async loadVisibleData() {
    const visibleData = await this.dataSource.getRange(
      this.startIndex,
      this.endIndex - this.startIndex
    );
    
    this.renderVisibleItems(visibleData);
  }
  
  updateVirtualContainer() {
    const totalHeight = this.totalItems * this.itemHeight;
    const offsetY = this.startIndex * this.itemHeight;
    
    this.scrollContainer.style.height = `${totalHeight}px`;
    this.contentContainer.style.transform = `translateY(${offsetY}px)`;
  }
}
```

### Memory Management & Caching
```javascript
class CacheAwareComponent {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 100;
    
    // Cleanup memory periodically
    setInterval(() => this.cleanupCache(), 60000);
  }
  
  async getCachedData(key) {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  setCachedData(key, data) {
    // Implement LRU cache eviction
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });
  }
  
  cleanupCache() {
    const now = Date.now();
    const expired = [];
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        expired.push(key);
      }
    }
    
    expired.forEach(key => this.cache.delete(key));
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
  }
}
```

---

## Component Structure & Patterns

### Base Component Template
```javascript
class BaseComponent {
  constructor(options = {}) {
    // Core setup
    this.options = { ...this.getDefaultOptions(), ...options };
    this.element = options.element || this.createElement();
    this.state = new ObservableState(this.getInitialState());
    
    // Security & monitoring setup
    this.authService = new AuthenticationService();
    this.auditLogger = new AuditLogger(this.constructor.name);
    this.performanceMonitor = new PerformanceMonitor();
    this.errorHandler = new ErrorHandler();
    
    // Accessibility setup
    this.setupAccessibilityFeatures();
    
    // Initialize component
    this.initialize();
  }
  
  // Abstract methods to be implemented by subclasses
  getDefaultOptions() { return {}; }
  getInitialState() { return {}; }
  render() { throw new Error('render() must be implemented'); }
  
  async initialize() {
    try {
      // Validate permissions
      await this.validateAccess();
      
      // Setup event listeners
      this.bindEvents();
      
      // Load initial data
      await this.loadData();
      
      // Render component
      await this.renderWithMonitoring();
      
      // Log component initialization
      this.auditLogger.log('component_initialized', {
        component: this.constructor.name,
        options: this.sanitizeOptions(this.options)
      });
      
    } catch (error) {
      this.handleError(error, { phase: 'initialization' });
    }
  }
  
  destroy() {
    // Cleanup event listeners
    this.unbindEvents();
    
    // Clear caches
    this.clearCaches();
    
    // Remove DOM elements
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    
    // Log component destruction
    this.auditLogger.log('component_destroyed', {
      component: this.constructor.name
    });
  }
}
```

### Event/Item Specific Components
```javascript
class EventComponent extends BaseComponent {
  getDefaultOptions() {
    return {
      showDueDate: true,
      showPriority: true,
      allowEdit: true,
      requiredPermissions: [
        { operation: 'READ', resource: { type: 'event' } }
      ]
    };
  }
  
  render() {
    const event = this.state.get('event');
    
    return `
      <div class="event-component" data-event-id="${event.event_id}">
        <header class="event-header">
          <h2 class="event-title">${this.escapeHtml(event.title)}</h2>
          ${this.renderEventStatus(event)}
          ${this.renderPriority(event)}
        </header>
        
        <div class="event-content">
          ${this.renderDescription(event)}
          ${this.renderDueDate(event)}
          ${this.renderCustomFields(event)}
        </div>
        
        <footer class="event-footer">
          ${this.renderUniversalSystems(event)}
          ${this.renderActions(event)}
        </footer>
      </div>
    `;
  }
  
  async handleEventUpdate(updateData) {
    await this.performAuditableAction('event_update', {
      entity_type: 'event',
      entity_id: this.state.get('event').event_id,
      updates: updateData
    }, 'internal');
  }
}

class ItemComponent extends BaseComponent {
  getDefaultOptions() {
    return {
      showQuantity: true,
      showLocation: true,
      showValue: true,
      requiredPermissions: [
        { operation: 'READ', resource: { type: 'item' } }
      ]
    };
  }
  
  render() {
    const item = this.state.get('item');
    
    return `
      <div class="item-component" data-item-id="${item.item_id}">
        <header class="item-header">
          <h2 class="item-name">${this.escapeHtml(item.name)}</h2>
          ${this.renderItemStatus(item)}
          ${this.renderQuantity(item)}
        </header>
        
        <div class="item-content">
          ${this.renderDescription(item)}
          ${this.renderLocation(item)}
          ${this.renderValue(item)}
          ${this.renderCustomFields(item)}
        </div>
        
        <footer class="item-footer">
          ${this.renderUniversalSystems(item)}
          ${this.renderActions(item)}
        </footer>
      </div>
    `;
  }
}
```

---

## Testing & Quality Assurance

### Component Testing Requirements
All components must include comprehensive tests covering functionality, accessibility, and security.

```javascript
// test/components/EventComponent.test.js
describe('EventComponent', () => {
  let component;
  let mockEventViewModel;
  let mockAuthService;
  
  beforeEach(() => {
    mockEventViewModel = new MockEventViewModel();
    mockAuthService = new MockAuthenticationService();
    
    component = new EventComponent({
      viewModel: mockEventViewModel,
      authService: mockAuthService
    });
  });
  
  describe('Security Tests', () => {
    test('should validate user permissions on initialization', async () => {
      const unauthorizedUser = { permissions: [] };
      mockAuthService.setCurrentUser(unauthorizedUser);
      
      await expect(component.initialize()).rejects.toThrow('Access denied');
    });
    
    test('should sanitize user input', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const sanitized = component.sanitizeInput(maliciousInput);
      
      expect(sanitized).not.toContain('<script>');
    });
    
    test('should log security events', async () => {
      const spy = jest.spyOn(component.auditLogger, 'log');
      
      await component.handleEventUpdate({ title: 'Updated Title' });
      
      expect(spy).toHaveBeenCalledWith('event_update', expect.any(Object));
    });
  });
  
  describe('Accessibility Tests', () => {
    test('should have proper ARIA attributes', () => {
      component.render();
      
      expect(component.element.getAttribute('role')).toBeTruthy();
      expect(component.element.getAttribute('aria-label')).toBeTruthy();
    });
    
    test('should support keyboard navigation', () => {
      component.render();
      
      const keyEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      const handleSpy = jest.spyOn(component, 'handleActivation');
      
      component.element.dispatchEvent(keyEvent);
      
      expect(handleSpy).toHaveBeenCalled();
    });
    
    test('should meet color contrast requirements', () => {
      component.render();
      
      const contrastRatio = component.calculateContrastRatio();
      expect(contrastRatio).toBeGreaterThan(4.5);
    });
  });
  
  describe('Performance Tests', () => {
    test('should render within performance budget', async () => {
      const startTime = performance.now();
      
      await component.render();
      
      const renderTime = performance.now() - startTime;
      expect(renderTime).toBeLessThan(100); // 100ms budget
    });
    
    test('should cleanup resources on destroy', () => {
      const spy = jest.spyOn(component, 'clearCaches');
      
      component.destroy();
      
      expect(spy).toHaveBeenCalled();
    });
  });
  
  describe('API Integration Tests', () => {
    test('should handle API errors gracefully', async () => {
      const apiError = new Error('Network error');
      mockEventViewModel.loadEvents.mockRejectedValue(apiError);
      
      await component.loadData();
      
      expect(component.state.get('error')).toBeTruthy();
      expect(component.state.get('loading')).toBe(false);
    });
    
    test('should implement offline-first behavior', async () => {
      navigator.onLine = false;
      
      await component.loadData();
      
      expect(component.getCachedData).toHaveBeenCalled();
    });
  });
});
```

---

## Component Documentation Requirements

### JSDoc Documentation
All components must include comprehensive JSDoc documentation.

```javascript
/**
 * EventListComponent - Displays a virtualized list of events with full accessibility support
 * 
 * @class EventListComponent
 * @extends {BaseComponent}
 * 
 * @description
 * A high-performance, accessible event list component that implements:
 * - Virtual scrolling for handling large datasets (1000+ events)
 * - Full ARIA support and keyboard navigation
 * - Offline-first data loading with intelligent caching
 * - Comprehensive audit logging and security controls
 * - Integration with Universal Systems (tags, custom fields, collections)
 * 
 * @example
 * ```javascript
 * const eventList = new EventListComponent({
 *   container: document.getElementById('event-list'),
 *   viewModel: eventViewModel,
 *   maxItems: 1000,
 *   itemHeight: 80,
 *   allowEdit: true,
 *   requiredPermissions: [{ operation: 'READ', resource: { type: 'event' } }]
 * });
 * ```
 * 
 * @param {Object} options - Component configuration
 * @param {HTMLElement} options.container - DOM container element
 * @param {EventViewModel} options.viewModel - Event data view model
 * @param {number} [options.maxItems=1000] - Maximum items to render
 * @param {number} [options.itemHeight=50] - Height of each item in pixels
 * @param {boolean} [options.allowEdit=true] - Allow inline editing
 * @param {Array} [options.requiredPermissions] - Required permissions array
 * 
 * @security
 * - Validates user permissions on initialization
 * - Sanitizes all user input
 * - Logs all user interactions for audit trail
 * - Implements secure data loading with authentication
 * 
 * @accessibility
 * - Full ARIA support with proper roles and labels
 * - Keyboard navigation with arrow keys and tab
 * - Screen reader compatibility with live regions
 * - High contrast mode support
 * - Focus management for complex interactions
 * 
 * @performance
 * - Virtual scrolling for large datasets
 * - Intelligent caching with LRU eviction
 * - Debounced scroll handling
 * - Memory cleanup on component destruction
 * - Lazy loading of non-visible content
 * 
 * @fires EventListComponent#event-selected
 * @fires EventListComponent#event-edited
 * @fires EventListComponent#security-violation
 */
```

---

## Summary Checklist for Component Development

When creating any web component for this application, ensure you implement:

### ✅ Architecture Compliance
- [ ] Follows MVVM pattern with proper separation of concerns
- [ ] Respects Event/Item dichotomy in design and functionality
- [ ] Integrates with Universal Systems (tags, custom fields, collections, links)
- [ ] Implements ObservableState for reactive updates

### ✅ Security Implementation
- [ ] Input validation and XSS prevention
- [ ] Authentication and authorization checks
- [ ] Secure file upload handling (if applicable)
- [ ] Comprehensive audit logging of all actions

### ✅ Accessibility Requirements
- [ ] Proper ARIA attributes and semantic HTML
- [ ] Full keyboard navigation support
- [ ] Screen reader compatibility
- [ ] Color contrast compliance (4.5:1 minimum)
- [ ] Focus management for complex interactions

### ✅ Performance Optimization
- [ ] Virtual scrolling for large datasets (1000+ items)
- [ ] Intelligent caching with memory management
- [ ] Lazy loading of non-critical content
- [ ] Performance monitoring and logging
- [ ] Resource cleanup on component destruction

### ✅ API & Data Integration
- [ ] RESTful API integration with proper error handling
- [ ] Offline-first behavior with local caching
- [ ] Synchronization support with conflict resolution
- [ ] Universal Systems integration
- [ ] Sparse fieldsets for performance

### ✅ Testing & Quality
- [ ] Unit tests for all functionality
- [ ] Security testing for input validation
- [ ] Accessibility testing with automated tools
- [ ] Performance testing with benchmarks
- [ ] Integration testing with API endpoints

### ✅ Documentation
- [ ] Comprehensive JSDoc with examples
- [ ] Security considerations documented
- [ ] Accessibility features documented
- [ ] Performance characteristics documented
- [ ] Usage examples and API reference

By following these guidelines, you ensure that every component contributes to a secure, accessible, performant, and maintainable application that scales to enterprise requirements while providing an excellent user experience.
