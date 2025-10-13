# Utilities Development Context

## Related Context

- [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md)
- [tests/GEMINI.md](tests/GEMINI.md)

## 🛠️ Utility Function Philosophy

All utility functions follow these principles:
- **Pure Functions**: No side effects, predictable outputs.
- **Universal Application**: Work with both Events and Items where applicable.
- **Performance Focused**: Optimized for frequent use.
- **Error Handling**: Graceful degradation and clear error messages.
- **Testable**: Easy to unit test in isolation.

## 🚀 How to...

### Add a new utility function

1.  **Identify the right file**: Choose the appropriate utility file (`dateUtils.js`, `stringUtils.js`, etc.) for the new function.
2.  **Write the function**: Write the function as a static method of the class.
3.  **Add comments**: Add comments to explain the purpose of the function and its parameters.
4.  **Write tests**: Add unit tests for the new function in the corresponding test file in the `tests/unit/utils` directory.

## 📅 Date Utilities (dateUtils.js)

### Natural Language Date Parsing
```javascript
class DateUtils {
  // Parse human-readable date inputs like "tomorrow", "next week", "2024-12-31", etc.
  static parseNaturalDate(input) {
    const normalizedInput = input.toLowerCase().trim();
    const now = new Date();
    
    // Relative dates
    const relativePatterns = {
      'today': () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      'tomorrow': () => {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      },
      'yesterday': () => {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      },
      'next week': () => {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek;
      },
      'next month': () => {
        const nextMonth = new Date(now);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth;
      },
      'end of week': () => {
        const endOfWeek = new Date(now);
        const daysUntilSunday = 7 - now.getDay();
        endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
        return endOfWeek;
      },
      'end of month': () => {
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return endOfMonth;
      }
    };
    
    // Check relative patterns
    for (const [pattern, dateFunction] of Object.entries(relativePatterns)) {
      if (normalizedInput.includes(pattern)) {
        return dateFunction();
      }
    }
    
    // Day of week patterns (next monday, this friday)
    const dayOfWeekPattern = /(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/;
    const dayMatch = normalizedInput.match(dayOfWeekPattern);
    if (dayMatch) {
      const [, when, dayName] = dayMatch;
      return this.getDateByDayOfWeek(dayName, when);
    }
    
    // Time patterns (2pm, 14:30, 9am)
    const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const timeMatch = normalizedInput.match(timePattern);
    if (timeMatch) {
      const [, hours, minutes = '00', ampm] = timeMatch;
      return this.parseTimeWithDate(hours, minutes, ampm, now);
    }
    
    // ISO date patterns (2024-12-31, 12/31/2024)
    const isoDatePattern = /\d{4}-\d{2}-\d{2}/;
    const isoMatch = normalizedInput.match(isoDatePattern);
    if (isoMatch) {
      return new Date(isoMatch[0]);
    }
    
    // US date patterns (12/31/2024, 12-31-2024)
    const usDatePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
    const usMatch = normalizedInput.match(usDatePattern);
    if (usMatch) {
      const [, month, day, year] = usMatch;
      return new Date(year, month - 1, day);
    }
    
    // If no pattern matches, try native Date parsing as a fallback
    const nativeDate = new Date(input);
    return isNaN(nativeDate.getTime()) ? null : nativeDate;
  }
  
  static getDateByDayOfWeek(dayName, when = 'next') {
    const days = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    
    const now = new Date();
    const targetDay = days[dayName.toLowerCase()];
    const currentDay = now.getDay();
    
    let daysToAdd;
    if (when === 'this') {
      daysToAdd = targetDay >= currentDay ? 
        targetDay - currentDay : 
        (7 - currentDay) + targetDay;
    } else { // 'next'
      daysToAdd = targetDay > currentDay ? 
        targetDay - currentDay : 
        (7 - currentDay) + targetDay;
    }
    
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysToAdd);
    return targetDate;
  }
  
  static parseTimeWithDate(hours, minutes, ampm, baseDate = new Date()) {
    let hour24 = parseInt(hours);
    
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && hour24 !== 12) {
        hour24 += 12;
      } else if (ampm.toLowerCase() === 'am' && hour24 === 12) {
        hour24 = 0;
      }
    }
    
    const result = new Date(baseDate);
    result.setHours(hour24, parseInt(minutes), 0, 0);
    return result;
  }
  
  // Date formatting utilities
  static formatRelative(date) {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
    if (diffDays > 7) return `In ${Math.ceil(diffDays / 7)} weeks`;
    if (diffDays < -7) return `${Math.ceil(Math.abs(diffDays) / 7)} weeks ago`;
    
    return date.toLocaleDateString();
  }
  
  static formatFriendly(date, includeTime = false) {
    const options = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    
    return date.toLocaleDateString('en-US', options);
  }
  
  // Date range utilities
  static getDateRange(rangeType) {
    const now = new Date();
    const ranges = {
      today: [
        new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      ],
      this_week: [
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()),
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7)
      ],
      this_month: [
        new Date(now.getFullYear(), now.getMonth(), 1),
        new Date(now.getFullYear(), now.getMonth() + 1, 1)
      ],
      this_year: [
        new Date(now.getFullYear(), 0, 1),
        new Date(now.getFullYear() + 1, 0, 1)
      ]
    };
    
    return ranges[rangeType] || null;
  }
}
```

## 🔤 String Utilities (stringUtils.js)

### Natural Language Processing
```javascript
class StringUtils {
  // Extract structured data from natural language input
  static parseQuickCapture(input) {
    const data = {
      originalInput: input,
      title: input,
      tags: [],
      priority: null,
      location: null,
      budget: null,
      due_date: null,
      involves_action: this.detectActionLanguage(input)
    };
    
    // Extract tags (e.g., #work, #urgent)
    const tagMatches = input.match(/#(\w+)/g);
    if (tagMatches) {
      data.tags = tagMatches.map(tag => tag.substring(1).toLowerCase());
      data.title = data.title.replace(/#\w+/g, '').trim();
    }
    
    // Extract priority (e.g., priority:high, p:4, !urgent)
    const priorityPatterns = [
      {regex: /priority:\s*(high|medium|low|urgent)/i, map: {'high': 5, 'urgent': 5, 'medium': 3, 'low': 1}},
      {regex: /p:\s*(\d)/i, map: null},
      {regex: /!urgent/i, value: 5},
      {regex: /!!critical/i, value: 5}
    ];
    
    for (const pattern of priorityPatterns) {
      const match = data.title.match(pattern.regex);
      if (match) {
        if (pattern.map) {
          data.priority = pattern.map[match[1].toLowerCase()];
        } else if (pattern.value) {
          data.priority = pattern.value;
        } else {
          data.priority = parseInt(match[1]);
        }
        data.title = data.title.replace(match[0], '').trim();
        break;
      }
    }
    
    // Extract location (e.g., @office, at:home)
    const locationPatterns = [
      /@(\w+)/,
      /at:\s*(\w+)/i,
      /\bat\s+([a-zA-Z\s]+?)(?=\s|$|[#@$])/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = data.title.match(pattern);
      if (match) {
        data.location = match[1].trim();
        data.title = data.title.replace(match[0], '').trim();
        break;
      }
    }
    
    // Extract budget/cost (e.g., $100, cost:50, budget:1000)
    const budgetPatterns = [
      /\$(\d+(?:\.\d{2})?)/,
      /cost:\s*(\d+(?:\.\d{2})?)/i,
      /budget:\s*(\d+(?:\.\d{2})?)/i
    ];
    
    for (const pattern of budgetPatterns) {
      const match = data.title.match(pattern);
      if (match) {
        data.budget = parseFloat(match[1]);
        data.title = data.title.replace(match[0], '').trim();
        break;
      }
    }
    
    // Extract duration for events (e.g., 45min, 2h, 1.5 hours)
    if (data.involves_action) {
      const durationPattern = /(\d+(?:\.\d+)?)\s*(min|minutes|h|hour|hours)/i;
      const durationMatch = data.title.match(durationPattern);
      if (durationMatch) {
        const value = parseFloat(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        data.duration = unit.startsWith('h') ? value * 60 : value; // Convert to minutes
        data.title = data.title.replace(durationMatch[0], '').trim();
      }
    }
    
    // Extract quantity for items (e.g., 5x, qty:10, quantity:25)
    if (!data.involves_action) {
      const quantityPatterns = [
        /(\d+)x\b/i,
        /qty:\s*(\d+)/i,
        /quantity:\s*(\d+)/i
      ];
      
      for (const pattern of quantityPatterns) {
        const match = data.title.match(pattern);
        if (match) {
          data.quantity = parseInt(match[1]);
          data.title = data.title.replace(match[0], '').trim();
          break;
        }
      }
    }
    
    // Clean up the title
    data.title = data.title.replace(/\s+/g, ' ').trim();
    
    return data;
  }
  
  static detectActionLanguage(text) {
    const actionWords = [
      // Verbs that indicate actions
      'call', 'email', 'meet', 'buy', 'purchase', 'schedule', 'plan',
      'complete', 'finish', 'start', 'begin', 'send', 'write', 'create',
      'update', 'review', 'check', 'verify', 'confirm', 'cancel',
      'book', 'reserve', 'order', 'ship', 'deliver', 'install',
      'repair', 'fix', 'clean', 'organize', 'workout', 'exercise',
      'study', 'read', 'learn', 'teach', 'present', 'discuss'
    ];
    
    const actionPatterns = [
      // Imperative patterns
      /^(call|email|text|message)/i,
      /^(buy|purchase|order|get)/i,
      /^(schedule|plan|book)/i,
      /^(complete|finish|do)/i,
      /^(meet|visit|go)/i,
      // Gerund patterns (-ing verbs)
      /\b\w+ing\b/,
      // Task-like patterns
      /^(remind|follow up|check up)/i
    ];
    
    const lowerText = text.toLowerCase();
    
    // Check for action patterns
    for (const pattern of actionPatterns) {
      if (pattern.test(text)) return true;
    }
    
    // Check for action words
    for (const word of actionWords) {
      if (lowerText.includes(word)) return true;
    }
    
    // Check for time indicators (suggests scheduled action)
    const timeIndicators = ['tomorrow', 'today', 'at', 'pm', 'am', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    for (const indicator of timeIndicators) {
      if (lowerText.includes(indicator)) return true;
    }
    
    // Default to item if no action indicators are found
    return false;
  }
  
  // Text formatting and manipulation
  static truncate(text, maxLength = 100, suffix = '...') {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  }
  
  static titleCase(text) {
    return text.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
  
  static camelCase(text) {
    return text
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/\s+/g, '');
  }
  
  static kebabCase(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  // Search and highlighting utilities
  static highlightMatches(text, searchQuery) {
    if (!searchQuery) return text;
    
    const regex = new RegExp(`(${this.escapeRegex(searchQuery)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
  
  static escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\\]/g, '\\$&');
  }
  
  // Validation utilities
  static isEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  static isUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  static isPhoneNumber(phone) {
    const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)\.]/g, ''));
  }
}
```

## ✅ Validation Utilities (validationUtils.js)

### Universal Entity Validation
```javascript
class ValidationUtils {
  // Universal validation rules that work for both Events and Items
  static validateEntity(data, entityType = 'event') {
    const errors = [];
    
    // Common validation rules
    errors.push(...this.validateRequired(data, entityType));
    errors.push(...this.validateDataTypes(data));
    errors.push(...this.validateRanges(data));
    errors.push(...this.validateFormat(data));
    
    // Entity-specific validation
    if (entityType === 'event') {
      errors.push(...this.validateEventSpecific(data));
    } else if (entityType === 'item') {
      errors.push(...this.validateItemSpecific(data));
    }
    
    return errors;
  }
  
  static validateRequired(data, entityType) {
    const errors = [];
    
    // Universal required fields
    if (!data.title && !data.name) {
      errors.push(`${entityType === 'event' ? 'Title' : 'Name'} is required`);
    }
    
    // Entity-specific required fields
    const requiredFields = {
      event: [],
      item: []
    };
    
    for (const field of requiredFields[entityType] || []) {
      if (!data[field]) {
        errors.push(`${this.fieldDisplayName(field)} is required`);
      }
    }
    
    return errors;
  }
  
  static validateDataTypes(data) {
    const errors = [];
    
    const typeValidations = {
      priority: (value) => Number.isInteger(value),
      budget: (value) => typeof value === 'number' && !isNaN(value),
      value: (value) => typeof value === 'number' && !isNaN(value),
      quantity: (value) => Number.isInteger(value),
      due_date: (value) => value instanceof Date && !isNaN(value.getTime())
    };
    
    for (const [field, validator] of Object.entries(typeValidations)) {
      if (data[field] !== undefined && data[field] !== null && !validator(data[field])) {
        errors.push(`${this.fieldDisplayName(field)} must be a valid ${this.getExpectedType(field)}`);
      }
    }
    
    return errors;
  }
  
  static validateRanges(data) {
    const errors = [];
    
    const rangeValidations = {
      priority: [1, 5],
      budget: [0, Number.MAX_SAFE_INTEGER],
      value: [0, Number.MAX_SAFE_INTEGER],
      quantity: [0, Number.MAX_SAFE_INTEGER]
    };
    
    for (const [field, [min, max]] of Object.entries(rangeValidations)) {
      if (data[field] !== undefined && data[field] !== null) {
        if (data[field] < min) {
          errors.push(`${this.fieldDisplayName(field)} must be at least ${min}`);
        }
        if (data[field] > max) {
          errors.push(`${this.fieldDisplayName(field)} cannot exceed ${max}`);
        }
      }
    }
    
    return errors;
  }
  
  static validateFormat(data) {
    const errors = [];
    
    // Email validation
    if (data.email && !StringUtils.isEmail(data.email)) {
      errors.push('Email must be a valid email address');
    }
    
    // URL validation
    if (data.url && !StringUtils.isUrl(data.url)) {
      errors.push('URL must be a valid web address');
    }
    
    // Phone validation
    if (data.phone && !StringUtils.isPhoneNumber(data.phone)) {
      errors.push('Phone must be a valid phone number');
    }
    
    // Tag validation
    if (data.tags && Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        if (typeof tag !== 'string' || tag.length === 0) {
          errors.push('All tags must be non-empty strings');
          break;
        }
        if (tag.length > 50) {
          errors.push('Tags cannot exceed 50 characters');
          break;
        }
      }
    }
    
    return errors;
  }
  
  static validateEventSpecific(data) {
    const errors = [];
    
    // Due date cannot be in the past (except for completed events)
    if (data.due_date && data.due_date < new Date() && !data.completed) {
      errors.push('Due date cannot be in the past for incomplete events');
    }
    
    // Duration validation
    if (data.duration !== undefined) {
      if (!Number.isInteger(data.duration) || data.duration <= 0) {
        errors.push('Duration must be a positive number of minutes');
      }
      if (data.duration > 1440) { // 24 hours
        errors.push('Duration cannot exceed 24 hours (1440 minutes)');
      }
    }
    
    return errors;
  }
  
  static validateItemSpecific(data) {
    const errors = [];
    
    // Quantity validation for items
    if (data.quantity !== undefined && data.quantity < 0) {
      errors.push('Quantity cannot be negative');
    }
    
    // Serial number validation
    if (data.serial_number && data.serial_number.length > 100) {
      errors.push('Serial number cannot exceed 100 characters');
    }
    
    return errors;
  }
  
  // Custom field validation
  static validateCustomFields(customFields, fieldDefinitions) {
    const errors = [];
    
    for (const [fieldName, value] of Object.entries(customFields)) {
      const definition = fieldDefinitions.find(def => def.field_name === fieldName);
      if (!definition) continue;
      
      // Required field validation
      if (definition.is_required && (value === null || value === undefined || value === '')) {
        errors.push(`${definition.display_name} is required`);
        continue;
      }
      
      // Skip further validation if field is empty and not required
      if (value === null || value === undefined || value === '') continue;
      
      // Type validation
      const typeErrors = this.validateCustomFieldType(value, definition.field_type, definition.display_name);
      errors.push(...typeErrors);
      
      // Range validation
      if (definition.validation_rules) {
        const rangeErrors = this.validateCustomFieldRules(value, definition.validation_rules, definition.display_name);
        errors.push(...rangeErrors);
      }
    }
    
    return errors;
  }
  
  static validateCustomFieldType(value, fieldType, displayName) {
    const errors = [];
    
    switch (fieldType) {
      case 'integer':
        if (!Number.isInteger(Number(value))) {
          errors.push(`${displayName} must be a whole number`);
        }
        break;
      case 'decimal':
        if (isNaN(Number(value))) {
          errors.push(`${displayName} must be a number`);
        }
        break;
      case 'email':
        if (!StringUtils.isEmail(value)) {
          errors.push(`${displayName} must be a valid email address`);
        }
        break;
      case 'url':
        if (!StringUtils.isUrl(value)) {
          errors.push(`${displayName} must be a valid URL`);
        }
        break;
      case 'phone':
        if (!StringUtils.isPhoneNumber(value)) {
          errors.push(`${displayName} must be a valid phone number`);
        }
        break;
      case 'date':
        if (!(value instanceof Date) && isNaN(new Date(value).getTime())) {
          errors.push(`${displayName} must be a valid date`);
        }
        break;
    }
    
    return errors;
  }
  
  static validateCustomFieldRules(value, rules, displayName) {
    const errors = [];
    const numValue = Number(value);
    
    if (rules.min !== undefined && numValue < rules.min) {
      errors.push(`${displayName} must be at least ${rules.min}`);
    }
    
    if (rules.max !== undefined && numValue > rules.max) {
      errors.push(`${displayName} cannot exceed ${rules.max}`);
    }
    
    if (rules.minLength !== undefined && value.toString().length < rules.minLength) {
      errors.push(`${displayName} must be at least ${rules.minLength} characters long`);
    }
    
    if (rules.maxLength !== undefined && value.toString().length > rules.maxLength) {
      errors.push(`${displayName} cannot exceed ${rules.maxLength} characters`);
    }
    
    if (rules.pattern !== undefined) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value.toString())) {
        errors.push(`${displayName} does not match the required format`);
      }
    }
    
    return errors;
  }
  
  // Helper methods
  static fieldDisplayName(fieldName) {
    const displayNames = {
      due_date: 'Due Date',
      created_at: 'Created Date',
      updated_at: 'Updated Date',
      serial_number: 'Serial Number',
      phone_number: 'Phone Number'
    };
    
    return displayNames[fieldName] || StringUtils.titleCase(fieldName.replace(/_/g, ' '));
  }
  
  static getExpectedType(fieldName) {
    const typeMap = {
      priority: 'integer',
      budget: 'number',
      value: 'number',
      quantity: 'integer',
      due_date: 'date'
    };
    
    return typeMap[fieldName] || 'text';
  }
}
```

## ⚡ Performance Utilities (performanceUtils.js)

### Query and Operation Optimization
```javascript
class PerformanceUtils {
  // Query performance monitoring
  static async measureQueryPerformance(queryName, queryFunction) {
    const startTime = performance.now();
    
    try {
      const result = await queryFunction();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Log slow queries for debugging
      if (duration > 1000) { // > 1 second
        console.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
      }
      
      // Store performance metrics for analysis
      this.recordQueryMetrics(queryName, duration, result?.length || 0);
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.error(`Query failed: ${queryName} (${duration.toFixed(2)}ms)`, error);
      throw error;
    }
  }
  
  static recordQueryMetrics(queryName, duration, resultCount) {
    if (!window.queryMetrics) window.queryMetrics = {};
    
    if (!window.queryMetrics[queryName]) {
      window.queryMetrics[queryName] = {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: Infinity
      };
    }
    
    const metrics = window.queryMetrics[queryName];
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.avgDuration = metrics.totalDuration / metrics.count;
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    metrics.lastResultCount = resultCount;
  }
  
  // Debouncing for frequent operations to improve performance
  static debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      
      if (callNow) func(...args);
    };
  }
  
  // Throttling for performance-sensitive operations
  static throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Batch processing for large datasets to prevent UI blocking
  static async processBatch(items, processor, batchSize = 100) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(processor));
      results.push(...batchResults);
      
      // Allow UI updates between batches
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return results;
  }
  
  // Memory usage monitoring
  static getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
        total: Math.round(performance.memory.totalJSHeapSize / 1048576), // MB
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576) // MB
      };
    }
    return null;
  }
  
  // Cache implementation for expensive operations
  static createCache(maxSize = 100, ttlMs = 60000) {
    const cache = new Map();
    const timestamps = new Map();
    
    return {
      get(key) {
        if (!cache.has(key)) return null;
        
        const timestamp = timestamps.get(key);
        if (Date.now() - timestamp > ttlMs) {
          cache.delete(key);
          timestamps.delete(key);
          return null;
        }
        
        return cache.get(key);
      },
      
      set(key, value) {
        // Remove oldest entries if cache is full
        if (cache.size >= maxSize) {
          const oldestKey = cache.keys().next().value;
          cache.delete(oldestKey);
          timestamps.delete(oldestKey);
        }
        
        cache.set(key, value);
        timestamps.set(key, Date.now());
      },
      
      clear() {
        cache.clear();
        timestamps.clear();
      },
      
      size() {
        return cache.size;
      }
    };
  }
}
```

## 🎨 Template Engine (templateEngine.js)

### Dynamic Content Generation
```javascript
class TemplateEngine {
  // Template variable substitution with filters and conditional logic
  static render(template, data = {}, options = {}) {
    const context = {
      ...data,
      ...this.getSystemVariables(),
      ...this.getHelperFunctions()
    };
    
    let rendered = template;
    
    // Process conditional blocks first
    rendered = this.processConditionals(rendered, context);
    
    // Process loops
    rendered = this.processLoops(rendered, context);
    
    // Process variable substitution with filters
    rendered = this.processVariables(rendered, context);
    
    return rendered;
  }
  
  static processVariables(template, context) {
    // Match {{variable}} and {{variable | filter}} patterns
    const variableRegex = /\{\{\s*([^}|]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g;
    
    return template.replace(variableRegex, (match, variablePath, filterChain) => {
      let value = this.getNestedValue(context, variablePath.trim());
      
      if (filterChain) {
        value = this.applyFilters(value, filterChain, context);
      }
      
      return value !== undefined ? value : '';
    });
  }
  
  static processConditionals(template, context) {
    // Process {{#if condition}} ... {{/if}} blocks
    const conditionalRegex = /\{\{\#if\s+([^}]+)\}\}\]([\s\S]*?)\{\{\/if\}\}/g;
    
    return template.replace(conditionalRegex, (match, condition, content) => {
      const conditionValue = this.evaluateCondition(condition.trim(), context);
      return conditionValue ? content : '';
    });
  }
  
  static processLoops(template, context) {
    // Process {{#each items}} ... {{/each}} blocks
    const loopRegex = /\{\{\#each\s+([^}]+)\}\}\]([\s\S]*?)\{\{\/each\}\}/g;
    
    return template.replace(loopRegex, (match, arrayPath, itemTemplate) => {
      const array = this.getNestedValue(context, arrayPath.trim());
      if (!Array.isArray(array)) return '';
      
      return array.map((item, index) => {
        const itemContext = {
          ...context,
          this: item,
          '@index': index,
          '@first': index === 0,
          '@last': index === array.length - 1
        };
        
        return this.processVariables(itemTemplate, itemContext);
      }).join('');
    });
  }
  
  static evaluateCondition(condition, context) {
    // Handle simple boolean conditions
    const value = this.getNestedValue(context, condition);
    
    // Handle comparison operators
    const comparisonRegex = /([^><=!]+)\s*(>=|<=|==|!=|>|<)\s*([^><=!]+)/;
    const comparisonMatch = condition.match(comparisonRegex);
    
    if (comparisonMatch) {
      const [, left, operator, right] = comparisonMatch;
      const leftValue = this.getNestedValue(context, left.trim());
      const rightValue = this.parseValue(right.trim(), context);
      
      switch (operator) {
        case '==': return leftValue == rightValue;
        case '!=': return leftValue != rightValue;
        case '>': return leftValue > rightValue;
        case '<': return leftValue < rightValue;
        case '>=': return leftValue >= rightValue;
        case '<=': return leftValue <= rightValue;
        default: return false;
      }
    }
    
    // Boolean evaluation
    return !!value;
  }
  
  static applyFilters(value, filterChain, context) {
    const filters = filterChain.split('|').map(f => f.trim());
    
    return filters.reduce((currentValue, filterSpec) => {
      const [filterName, ...args] = filterSpec.split(/\s*:\s*/);
      return this.applyFilter(currentValue, filterName.trim(), args, context);
    }, value);
  }
  
  static applyFilter(value, filterName, args, context) {
    const filters = {
      // Formatting filters
      date: (val, format = 'YYYY-MM-DD') => {
        const date = val instanceof Date ? val : new Date(val);
        return isNaN(date.getTime()) ? val : DateUtils.formatFriendly(date);
      },
      
      currency: (val, code = 'USD') => {
        const num = parseFloat(val);
        return isNaN(num) ? val : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: code
        }).format(num);
      },
      
      default: (val, defaultValue) => val !== undefined && val !== null && val !== '' ? val : defaultValue,
      
      uppercase: (val) => val?.toString().toUpperCase(),
      lowercase: (val) => val?.toString().toLowerCase(),
      titlecase: (val) => StringUtils.titleCase(val?.toString()),
      
      truncate: (val, length) => StringUtils.truncate(val?.toString(), parseInt(length) || 100),
      
      // Date filters
      relative_time: (val) => {
        const date = val instanceof Date ? val : new Date(val);
        return isNaN(date.getTime()) ? val : DateUtils.formatRelative(date);
      },
      
      // Number filters
      round: (val, decimals = 0) => {
        const num = parseFloat(val);
        return isNaN(num) ? val : num.toFixed(parseInt(decimals));
      },
      
      // Priority badge filter
      priority_badge: (val) => {
        const priority = parseInt(val);
        const badges = {
          5: '🔴 Critical',
          4: '🟠 High',
          3: '🟡 Medium',
          2: '🟢 Low',
          1: '⚪ Minimal'
        };
        return badges[priority] || `Priority ${priority}`;
      },
      
      // Array filters
      join: (val, separator = ', ') => Array.isArray(val) ? val.join(separator) : val,
      length: (val) => Array.isArray(val) || typeof val === 'string' ? val.length : 0,
      
      // Conditional filters
      if_empty: (val, replacement) => (!val || val === '') ? replacement : val
    };
    
    const filter = filters[filterName];
    return filter ? filter(value, ...args) : value;
  }
  
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  static parseValue(value, context) {
    // If it's a quoted string, return the string
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'" ) && value.endsWith("'" )))) {
      return value.slice(1, -1);
    }
    
    // If it's a number, return the number
    if (!isNaN(value) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    
    // Otherwise, try to get it from context
    return this.getNestedValue(context, value);
  }
  
  static getSystemVariables() {
    const now = new Date();
    return {
      today: now,
      now: now,
      current_date: now.toISOString().split('T')[0],
      current_time: now.toTimeString().split(' ')[0],
      current_year: now.getFullYear(),
      current_month: now.getMonth() + 1,
      current_day: now.getDate()
    };
  }
  
  static getHelperFunctions() {
    return {
      format_date: (date, format) => DateUtils.formatFriendly(date),
      time_until_due: (dueDate) => {
        const now = new Date();
        const due = new Date(dueDate);
        const diffMs = due - now;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return diffDays;
      },
      days_until_due: (dueDate) => {
        const now = new Date();
        const due = new Date(dueDate);
        const diffMs = due - now;
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }
    };
  }
}
```

---

*This utilities context enables AI agents to understand helper functions, performance optimization techniques, validation patterns, and template processing that support the Event/Item paradigm across the entire application.*