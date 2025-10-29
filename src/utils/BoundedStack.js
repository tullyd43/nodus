/**
 * BoundedStack
 * Memory-efficient stack with automatic eviction
 *
 * Used for undo/redo operations per level with configurable bounds
 * Maintains O(1) push/pop operations while preventing memory bloat
 */

export class BoundedStack {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.items = [];
    this.evictionCount = 0; // Track how many items have been evicted
  }

  /**
   * Add item to top of stack
   * Automatically evicts oldest items if stack exceeds maxSize
   */
  push(item) {
    // Add timestamp for operation tracking
    const stackItem = {
      data: item,
      timestamp: Date.now(),
      id: this.generateItemId(),
    };

    this.items.push(stackItem);

    // Evict oldest items if over limit
    while (this.items.length > this.maxSize) {
      const evicted = this.items.shift();
      this.evictionCount++;

      // Optional: notify about eviction for cleanup
      this.onEvict?.(evicted);
    }

    return stackItem.id;
  }

  /**
   * Remove and return top item from stack
   */
  pop() {
    if (this.items.length === 0) {
      return undefined;
    }

    const item = this.items.pop();
    return item.data;
  }

  /**
   * Look at top item without removing it
   */
  peek() {
    if (this.items.length === 0) {
      return undefined;
    }

    return this.items[this.items.length - 1].data;
  }

  /**
   * Get item at specific index from top (0 = top)
   */
  peekAt(index) {
    if (index < 0 || index >= this.items.length) {
      return undefined;
    }

    const actualIndex = this.items.length - 1 - index;
    return this.items[actualIndex].data;
  }

  /**
   * Check if stack is empty
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Check if stack is at capacity
   */
  isFull() {
    return this.items.length >= this.maxSize;
  }

  /**
   * Get current size
   */
  get size() {
    return this.items.length;
  }

  /**
   * Get remaining capacity
   */
  get remainingCapacity() {
    return this.maxSize - this.items.length;
  }

  /**
   * Clear all items
   */
  clear() {
    const clearedCount = this.items.length;
    this.items = [];
    return clearedCount;
  }

  /**
   * Convert to array (newest first)
   */
  toArray() {
    return this.items
      .slice()
      .reverse()
      .map((item) => item.data);
  }

  /**
   * Find item by predicate function
   */
  find(predicate) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (predicate(item.data, this.items.length - 1 - i)) {
        return item.data;
      }
    }
    return undefined;
  }

  /**
   * Filter items by predicate (returns new array)
   */
  filter(predicate) {
    return this.items
      .slice()
      .reverse()
      .map((item, index) => ({ data: item.data, index }))
      .filter(({ data, index }) => predicate(data, index))
      .map(({ data }) => data);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      size: this.items.length,
      maxSize: this.maxSize,
      utilizationPercent: Math.round((this.items.length / this.maxSize) * 100),
      evictionCount: this.evictionCount,
      oldestItemAge:
        this.items.length > 0 ? Date.now() - this.items[0].timestamp : 0,
      newestItemAge:
        this.items.length > 0
          ? Date.now() - this.items[this.items.length - 1].timestamp
          : 0,
      memoryEstimate: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimate memory usage in bytes
   */
  estimateMemoryUsage() {
    if (this.items.length === 0) return 0;

    // Rough estimate:
    // - Each item wrapper: ~100 bytes
    // - Each data object: variable (try to estimate)
    const wrapperOverhead = this.items.length * 100;

    let dataSize = 0;
    for (const item of this.items) {
      dataSize += this.estimateObjectSize(item.data);
    }

    return wrapperOverhead + dataSize;
  }

  /**
   * Rough estimation of object size in bytes
   */
  estimateObjectSize(obj) {
    if (obj === null || obj === undefined) return 0;

    if (typeof obj === "string") {
      return obj.length * 2; // 2 bytes per character for UTF-16
    }

    if (typeof obj === "number") {
      return 8; // 64-bit number
    }

    if (typeof obj === "boolean") {
      return 4;
    }

    if (Array.isArray(obj)) {
      return obj.reduce((sum, item) => sum + this.estimateObjectSize(item), 0);
    }

    if (typeof obj === "object") {
      let size = 0;
      for (const [key, value] of Object.entries(obj)) {
        size += key.length * 2; // Key size
        size += this.estimateObjectSize(value); // Value size
      }
      return size;
    }

    return 100; // Default estimate for unknown types
  }

  /**
   * Set eviction callback
   */
  onEvict(callback) {
    this.onEvict = callback;
  }

  /**
   * Generate unique ID for stack items
   */
  generateItemId() {
    return `stack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Batch operations for efficiency
   */
  pushMultiple(items) {
    const ids = [];
    for (const item of items) {
      ids.push(this.push(item));
    }
    return ids;
  }

  /**
   * Pop multiple items at once
   */
  popMultiple(count) {
    const items = [];
    for (let i = 0; i < count && !this.isEmpty(); i++) {
      items.push(this.pop());
    }
    return items;
  }

  /**
   * Trim stack to specific size
   */
  trimTo(newSize) {
    if (newSize >= this.items.length) return 0;

    const removeCount = this.items.length - newSize;
    const removed = this.items.splice(0, removeCount);
    this.evictionCount += removed.length;

    return removed.length;
  }

  /**
   * Get items within time range
   */
  getItemsInTimeRange(startTime, endTime) {
    return this.items
      .filter(
        (item) => item.timestamp >= startTime && item.timestamp <= endTime,
      )
      .map((item) => item.data)
      .reverse(); // Newest first
  }

  /**
   * Remove items older than specified age
   */
  removeItemsOlderThan(maxAge) {
    const cutoffTime = Date.now() - maxAge;
    let removeCount = 0;

    while (this.items.length > 0 && this.items[0].timestamp < cutoffTime) {
      this.items.shift();
      removeCount++;
      this.evictionCount++;
    }

    return removeCount;
  }
}
