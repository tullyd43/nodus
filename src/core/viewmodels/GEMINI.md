# ViewModels Layer Development Context

## Related Context

- [src/core/models/GEMINI.md](src/core/models/GEMINI.md)
- [src/core/utils/GEMINI.md](src/core/utils/GEMINI.md)
- [tests/GEMINI.md](tests/GEMINI.md)

## 🏗️ MVVM Architecture Pattern

### ViewModel Responsibilities
ViewModels handle ALL business logic, coordinate between Models and Views, and manage observable state:

```javascript
// Abstract base providing common ViewModel patterns
class BaseViewModel {
  constructor() {
    this.observableState = new ObservableState();
    this.isLoading = false;
    this.errors = [];
    this.subscribers = new Set();
  }
  
  // Observable state management
  setState(newState) {
    this.observableState.update(newState);
    this.notifySubscribers();
  }
  
  getState() {
    return this.observableState.get();
  }
  
  // Error handling
  setError(error) {
    this.errors.push(error);
    this.notifySubscribers();
  }
  
  clearErrors() {
    this.errors = [];
    this.notifySubscribers();
  }
  
  // Subscription management for view updates
  subscribe(callback) {
    this.subscribers.add(callback);
    // Return a function to unsubscribe
    return () => this.subscribers.delete(callback);
  }
  
  notifySubscribers() {
    this.subscribers.forEach(callback => callback(this.getState()));
  }
}
```

### Observable State Implementation
```javascript
class ObservableState {
  constructor(initialState = {}) {
    this.state = {...initialState};
    this.history = [];
    this.maxHistorySize = 50;
  }
  
  update(newState) {
    // Save current state to history for undo functionality
    this.history.push({...this.state});
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    // Update state
    this.state = {...this.state, ...newState};
  }
  
  get() {
    return {...this.state};
  }
  
  undo() {
    if (this.history.length > 0) {
      this.state = this.history.pop();
      return true;
    }
    return false;
  }
  
  reset(newState = {}) {
    this.state = {...newState};
    this.history = [];
  }
}
```

## 🚀 How to...

### Add a new ViewModel

1.  **Create a new file**: Create a new file in `src/core/viewmodels` (e.g., `NewViewModel.js`).
2.  **Extend `BaseViewModel`**: Extend the `BaseViewModel` class.
3.  **Initialize state**: In the constructor, call `this.setState` to set the initial state.
4.  **Add methods**: Add methods to handle business logic and update the state.

### Add a new state property

1.  **Update the initial state**: Add the new property to the `setState` call in the ViewModel's constructor.
2.  **Create a method to update the property**: Create a new method that calls `this.setState` to update the new property.

## 📋 Event ViewModel Implementation

### Core Event Management
```javascript
class EventViewModel extends BaseViewModel {
  constructor() {
    super();
    this.eventModel = new EventModel();
    this.eventTypeModel = new EventTypeModel();
    this.tagModel = new TagModel();
    
    this.setState({
      events: [],
      selectedEvent: null,
      eventTypes: [],
      availableTags: [],
      filterCriteria: {
        priority: null,
        due_date_range: null,
        tags: [],
        completed: null
      }
    });
  }
  
  // Event CRUD operations
  async createEvent(eventData) {
    try {
      this.isLoading = true;
      this.clearErrors();
      
      // Business logic validation
      const validationErrors = this.validateEventData(eventData);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(', '));
      }
      
      // Parse natural language input
      const parsedData = this.parseNaturalLanguageInput(eventData);
      
      // Create event via model
      const newEvent = await this.eventModel.create(parsedData);
      
      // Update state
      const currentEvents = this.getState().events;
      this.setState({
        events: [...currentEvents, newEvent],
        selectedEvent: newEvent
      });
      
      return newEvent;
      
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }
  
  async updateEvent(eventId, updateData) {
    try {
      this.isLoading = true;
      
      const updatedEvent = await this.eventModel.update(eventId, updateData);
      
      // Update state
      const events = this.getState().events.map(event => 
        event.id === eventId ? updatedEvent : event
      );
      
      this.setState({
        events,
        selectedEvent: updatedEvent
      });
      
      return updatedEvent;
      
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }
  
  async deleteEvent(eventId) {
    try {
      await this.eventModel.delete(eventId);
      
      // Update state
      const events = this.getState().events.filter(event => event.id !== eventId);
      this.setState({
        events,
        selectedEvent: null
      });
      
    } catch (error) {
      this.setError(error.message);
      throw error;
    }
  }
  
  // Natural language parsing business logic
  parseNaturalLanguageInput(input) {
    const data = {
      title: input,
      priority: 3,
      due_date: null,
      location: null,
      budget: null,
      tags: []
    };
    
    // Parse priority: "priority:high" or "priority:4"
    const priorityMatch = input.match(/priority:(\w+|\d+)/i);
    if (priorityMatch) {
      const priorityValue = priorityMatch[1].toLowerCase();
      if (priorityValue === 'high') data.priority = 5;
      else if (priorityValue === 'medium') data.priority = 3;
      else if (priorityValue === 'low') data.priority = 1;
      else if (!isNaN(priorityValue)) data.priority = parseInt(priorityValue);
      
      // Remove from title
      data.title = input.replace(priorityMatch[0], '').trim();
    }
    
    // Parse due date: "tomorrow", "next week", "2024-12-31"
    const datePatterns = [
      {pattern: /\btomorrow\b/i, date: this.getTomorrowDate()},
      {pattern: /\bnext week\b/i, date: this.getNextWeekDate()},
      {pattern: /\d{4}-\d{2}-\d{2}/i, date: null} // Will parse actual date
    ];
    
    for (const {pattern, date} of datePatterns) {
      const match = data.title.match(pattern);
      if (match) {
        data.due_date = date || new Date(match[0]);
        data.title = data.title.replace(match[0], '').trim();
        break;
      }
    }
    
    // Parse location: "@office", "@gym"
    const locationMatch = data.title.match(/@(\w+)/);
    if (locationMatch) {
      data.location = locationMatch[1];
      data.title = data.title.replace(locationMatch[0], '').trim();
    }
    
    // Parse budget: "$100", "$25.50"
    const budgetMatch = data.title.match(/\$(\d+\.?\d*)/);
    if (budgetMatch) {
      data.budget = parseFloat(budgetMatch[1]);
      data.title = data.title.replace(budgetMatch[0], '').trim();
    }
    
    // Parse tags: "#work", "#urgent"
    const tagMatches = data.title.match(/#(\w+)/g);
    if (tagMatches) {
      data.tags = tagMatches.map(tag => tag.substring(1));
      data.title = data.title.replace(/#\w+/g, '').trim();
    }
    
    return data;
  }
  
  // Date helper methods
  getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  
  getNextWeekDate() {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek;
  }
  
  // Validation business logic
  validateEventData(data) {
    const errors = [];
    
    if (!data.title || data.title.trim().length === 0) {
      errors.push('Event title is required');
    }
    
    if (data.priority && (data.priority < 1 || data.priority > 5)) {
      errors.push('Priority must be between 1 and 5');
    }
    
    if (data.due_date && new Date(data.due_date) < new Date()) {
      errors.push('Due date cannot be in the past');
    }
    
    if (data.budget && data.budget < 0) {
      errors.push('Budget cannot be negative');
    }
    
    return errors;
  }
  
  // Event filtering and searching
  async loadEvents(filters = {}) {
    try {
      this.isLoading = true;
      
      let events;
      
      if (filters.priority) {
        events = await this.eventModel.getByPriority(filters.priority);
      } else if (filters.overdue) {
        events = await this.eventModel.getOverdue();
      } else if (filters.upcoming) {
        events = await this.eventModel.getUpcoming(filters.limit || 10);
      } else {
        events = await this.eventModel.findAll();
      }
      
      // Apply additional client-side filtering
      events = this.applyClientFilters(events, filters);
      
      this.setState({events});
      
    } catch (error) {
      this.setError(error.message);
    } finally {
      this.isLoading = false;
    }
  }
  
  applyClientFilters(events, filters) {
    return events.filter(event => {
      // Tag filtering
      if (filters.tags && filters.tags.length > 0) {
        const eventTags = event.tags || [];
        const hasRequiredTag = filters.tags.some(tag => 
          eventTags.includes(tag)
        );
        if (!hasRequiredTag) return false;
      }
      
      // Date range filtering
      if (filters.due_date_range) {
        const eventDate = new Date(event.due_date);
        const [startDate, endDate] = filters.due_date_range;
        if (eventDate < startDate || eventDate > endDate) return false;
      }
      
      // Completion status filtering
      if (filters.completed !== null && filters.completed !== undefined) {
        if (event.completed !== filters.completed) return false;
      }
      
      return true;
    });
  }
  
  // Event completion management
  async markEventComplete(eventId) {
    try {
      await this.eventModel.markComplete(eventId);
      
      // Update state
      const events = this.getState().events.map(event => 
        event.id === eventId ? {...event, completed: true, completed_at: new Date()} : event
      );
      
      this.setState({events});
      
    } catch (error) {
      this.setError(error.message);
    }
  }
}
```

## 📦 Item ViewModel Implementation

### Asset and Resource Management
```javascript
class ItemViewModel extends BaseViewModel {
  constructor() {
    super();
    this.itemModel = new ItemModel();
    
    this.setState({
      items: [],
      selectedItem: null,
      inventory: [],
      categories: [],
      filterCriteria: {
        category: null,
        value_range: null,
        location: null,
        tags: []
      }
    });
  }
  
  async createItem(itemData) {
    try {
      this.isLoading = true;
      this.clearErrors();
      
      // Parse natural language for items
      const parsedData = this.parseItemInput(itemData);
      
      // Validate business rules
      const validationErrors = this.validateItemData(parsedData);
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(', '));
      }
      
      const newItem = await this.itemModel.create(parsedData);
      
      // Update state
      const currentItems = this.getState().items;
      this.setState({
        items: [...currentItems, newItem],
        selectedItem: newItem
      });
      
      return newItem;
      
    } catch (error) {
      this.setError(error.message);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }
  
  parseItemInput(input) {
    const data = {
      name: input,
      value: null,
      quantity: 1,
      location: null,
      tags: []
    };
    
    // Parse value: "$999", "$25.50"
    const valueMatch = input.match(/\$(\d+\.?\d*)/);
    if (valueMatch) {
      data.value = parseFloat(valueMatch[1]);
      data.name = input.replace(valueMatch[0], '').trim();
    }
    
    // Parse quantity: "5x", "qty:10"
    const quantityMatch = input.match(/(?:(\d+)x|qty:(\d+))/i);
    if (quantityMatch) {
      data.quantity = parseInt(quantityMatch[1] || quantityMatch[2]);
      data.name = data.name.replace(quantityMatch[0], '').trim();
    }
    
    // Parse location: "@warehouse", "@office"
    const locationMatch = data.name.match(/@(\w+)/);
    if (locationMatch) {
      data.location = locationMatch[1];
      data.name = data.name.replace(locationMatch[0], '').trim();
    }
    
    // Parse tags: "#equipment", "#tech"
    const tagMatches = data.name.match(/#(\w+)/g);
    if (tagMatches) {
      data.tags = tagMatches.map(tag => tag.substring(1));
      data.name = data.name.replace(/#\w+/g, '').trim();
    }
    
    return data;
  }
  
  validateItemData(data) {
    const errors = [];
    
    if (!data.name || data.name.trim().length === 0) {
      errors.push('Item name is required');
    }
    
    if (data.value && data.value < 0) {
      errors.push('Value cannot be negative');
    }
    
    if (data.quantity && data.quantity < 0) {
      errors.push('Quantity cannot be negative');
    }
    
    return errors;
  }
  
  // Inventory management
  async updateInventory(itemId, newQuantity) {
    try {
      await this.itemModel.updateQuantity(itemId, newQuantity);
      
      const items = this.getState().items.map(item =>
        item.id === itemId ? {...item, quantity: newQuantity} : item
      );
      
      this.setState({items});
      
    } catch (error) {
      this.setError(error.message);
    }
  }
  
  async loadInventoryReport() {
    try {
      this.isLoading = true;
      
      const inventory = await this.itemModel.getInventory();
      
      // Calculate inventory analytics
      const analytics = this.calculateInventoryAnalytics(inventory);
      
      this.setState({
        inventory,
        inventoryAnalytics: analytics
      });
      
    } catch (error) {
      this.setError(error.message);
    } finally {
      this.isLoading = false;
    }
  }
  
  calculateInventoryAnalytics(inventory) {
    const totalValue = inventory.reduce((sum, item) => sum + (item.value * item.quantity || 0), 0);
    const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const categoryCounts = inventory.reduce((counts, item) => {
      counts[item.category || 'Uncategorized'] = (counts[item.category || 'Uncategorized'] || 0) + 1;
      return counts;
    }, {});
    
    return {
      totalValue,
      totalItems,
      categoryBreakdown: categoryCounts,
      lowStockItems: inventory.filter(item => item.quantity <= (item.reorder_threshold || 5))
    };
  }
}
```

## 🗂️ Collection ViewModel Implementation

### Dynamic Filtering and Collections
```javascript
class CollectionViewModel extends BaseViewModel {
  constructor() {
    super();
    this.collectionModel = new CollectionModel();
    this.eventModel = new EventModel();
    this.itemModel = new ItemModel();
    
    this.setState({
      collections: [],
      activeCollection: null,
      collectionResults: [],
      queryBuilder: {
        entity_type: 'event',
        conditions: {
          operator: 'AND',
          rules: []
        }
      }
    });
    
    this.initializeSystemCollections();
  }
  
  async initializeSystemCollections() {
    // Create built-in system collections for common use cases
    const systemCollections = [
      {
        name: 'Today',
        query_definition: {
          entity_type: 'event',
          conditions: {
            operator: 'AND',
            rules: [
              {field: 'due_date', operator: 'date_equals', value: 'today'},
              {field: 'completed', operator: 'equals', value: false}
            ]
          }
        },
        is_system: true
      },
      {
        name: 'High Priority',
        query_definition: {
          entity_type: 'event',
          conditions: {
            operator: 'AND',
            rules: [
              {field: 'priority', operator: '>=', value: 4}
            ]
          }
        },
        is_system: true
      },
      {
        name: 'Overdue',
        query_definition: {
          entity_type: 'event',
          conditions: {
            operator: 'AND',
            rules: [
              {field: 'due_date', operator: '<', value: 'today'},
              {field: 'completed', operator: 'equals', value: false}
            ]
          }
        },
        is_system: true
      }
    ];
    
    for (const collection of systemCollections) {
      await this.createCollection(collection.name, collection.query_definition, collection.is_system);
    }
    
    await this.loadCollections();
  }
  
  async createCollection(name, queryDefinition, isSystem = false) {
    try {
      const newCollection = await this.collectionModel.createCollection(name, queryDefinition, isSystem);
      
      const collections = this.getState().collections;
      this.setState({
        collections: [...collections, newCollection]
      });
      
      return newCollection;
      
    } catch (error) {
      this.setError(error.message);
      throw error;
    }
  }
  
  async executeCollection(collectionId) {
    try {
      this.isLoading = true;
      
      const results = await this.collectionModel.executeCollection(collectionId);
      const collection = this.getState().collections.find(c => c.id === collectionId);
      
      this.setState({
        activeCollection: collection,
        collectionResults: results
      });
      
      return results;
      
    } catch (error) {
      this.setError(error.message);
    } finally {
      this.isLoading = false;
    }
  }
  
  // Query builder for custom collections
  addConditionToQuery(field, operator, value) {
    const queryBuilder = {...this.getState().queryBuilder};
    
    queryBuilder.conditions.rules.push({
      field,
      operator,
      value
    });
    
    this.setState({queryBuilder});
  }
  
  removeConditionFromQuery(index) {
    const queryBuilder = {...this.getState().queryBuilder};
    queryBuilder.conditions.rules.splice(index, 1);
    this.setState({queryBuilder});
  }
  
  async previewQuery() {
    try {
      const queryBuilder = this.getState().queryBuilder;
      const results = await this.collectionModel.executeQuery(queryBuilder);
      
      this.setState({
        collectionResults: results,
        activeCollection: {name: 'Preview', query_definition: queryBuilder}
      });
      
      return results;
      
    } catch (error) {
      this.setError(error.message);
    }
  }
}
```

## 🎯 Main ViewModel (Application Coordinator)

### Central State Management
```javascript
class MainViewModel extends BaseViewModel {
  constructor() {
    super();
    
    // Initialize child ViewModels
    this.eventVM = new EventViewModel();
    this.itemVM = new ItemViewModel();
    this.collectionVM = new CollectionViewModel();
    this.quickCaptureVM = new QuickCaptureViewModel();
    
    // Application-level state
    this.setState({
      currentView: 'dashboard',
      searchQuery: '',
      searchResults: [],
      recentActivity: [],
      notifications: [],
      appSettings: {
        theme: 'light',
        defaultPriority: 3,
        autoSave: true,
        showCompletedEvents: false
      }
    });
    
    // Subscribe to child ViewModel changes to update application-level state
    this.setupChildSubscriptions();
  }
  
  setupChildSubscriptions() {
    this.eventVM.subscribe((eventState) => {
      this.updateRecentActivity('event', eventState.events);
    });
    
    this.itemVM.subscribe((itemState) => {
      this.updateRecentActivity('item', itemState.items);
    });
  }
  
  updateRecentActivity(type, entities) {
    const recentActivity = this.getState().recentActivity;
    const newActivity = {
      type,
      timestamp: new Date(),
      count: entities.length,
      latest: entities.slice(0, 3)
    };
    
    this.setState({
      recentActivity: [newActivity, ...recentActivity.slice(0, 9)]
    });
  }
  
  // Global search across all entities
  async performGlobalSearch(query) {
    try {
      this.isLoading = true;
      
      const [eventResults, itemResults] = await Promise.all([
        this.searchEvents(query),
        this.searchItems(query)
      ]);
      
      const searchResults = [
        ...eventResults.map(r => ({...r, entity_type: 'event'})),
        ...itemResults.map(r => ({...r, entity_type: 'item'}))
      ];
      
      this.setState({searchQuery: query, searchResults});
      
      return searchResults;
      
    } catch (error) {
      this.setError(error.message);
    } finally {
      this.isLoading = false;
    }
  }
  
  async searchEvents(query) {
    const events = await this.eventVM.eventModel.findAll();
    return events.filter(event => 
      event.title.toLowerCase().includes(query.toLowerCase()) ||
      (event.description && event.description.toLowerCase().includes(query.toLowerCase()))
    );
  }
  
  async searchItems(query) {
    const items = await this.itemVM.itemModel.findAll();
    return items.filter(item => 
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(query.toLowerCase()))
    );
  }
  
  // Navigation and view management
  navigateToView(viewName, params = {}) {
    this.setState({
      currentView: viewName,
      viewParams: params
    });
  }
  
  // Settings management
  updateSetting(key, value) {
    const appSettings = {...this.getState().appSettings};
    appSettings[key] = value;
    this.setState({appSettings});
    
    // Persist to localStorage for persistence across sessions
    localStorage.setItem('app_settings', JSON.stringify(appSettings));
  }
  
  loadSettings() {
    try {
      const saved = localStorage.getItem('app_settings');
      if (saved) {
        const appSettings = JSON.parse(saved);
        this.setState({appSettings});
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }
}
```

## 🧪 ViewModel Testing Patterns

### Unit Testing ViewModels
```javascript
describe('EventViewModel', () => {
  let eventVM;
  let mockEventModel;
  
  beforeEach(() => {
    // Mock the model to isolate the ViewModel
    mockEventModel = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    
    eventVM = new EventViewModel();
    eventVM.eventModel = mockEventModel;
  });
  
  it('should parse natural language input correctly', () => {
    const input = 'Call John tomorrow 2pm #work priority:high';
    const parsed = eventVM.parseNaturalLanguageInput(input);
    
    expect(parsed.title).toBe('Call John 2pm');
    expect(parsed.priority).toBe(5);
    expect(parsed.tags).toContain('work');
    expect(parsed.due_date).toBeTruthy();
  });
  
  it('should validate event data', () => {
    const invalidData = {title: '', priority: 6, budget: -100};
    const errors = eventVM.validateEventData(invalidData);
    
    expect(errors).toHaveLength(3);
    expect(errors).toContain('Event title is required');
    expect(errors).toContain('Priority must be between 1 and 5');
    expect(errors).toContain('Budget cannot be negative');
  });
  
  it('should create event and update state', async () => {
    const eventData = {title: 'Test Event', priority: 4};
    const mockEvent = {id: 1, ...eventData};
    
    mockEventModel.create.mockResolvedValue(mockEvent);
    
    const result = await eventVM.createEvent(eventData);
    
    expect(mockEventModel.create).toHaveBeenCalledWith(eventData);
    expect(result).toEqual(mockEvent);
    expect(eventVM.getState().events).toContain(mockEvent);
  });
});
```

---

*This ViewModels context enables AI agents to understand MVVM patterns, business logic separation, state management, and provides guidance on implementing reactive, testable ViewModels that coordinate between data models and user interfaces following the Event/Item paradigm.*