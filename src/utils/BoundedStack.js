/**
 * @class BoundedStack
 * @description A memory-efficient stack with a fixed capacity. When the stack exceeds its maximum size,
 * the oldest items are automatically evicted. This is ideal for managing undo/redo history
 * or any list of operations where only a limited history is needed.
 *
 * @template T The type of data stored in the stack.
 */
export class BoundedStack {
	/**
	 * Creates an instance of BoundedStack.
	 * @param {number} [maxSize=50] - The maximum number of items the stack can hold before evicting the oldest ones.
	 */
	constructor(maxSize = 50) {
		this.maxSize = maxSize;
		this.items = [];
		this.evictionCount = 0; // Track how many items have been evicted
	}

	/**
	 * Adds an item to the top of the stack.
	 * If the stack's size exceeds `maxSize` after adding, the oldest item is removed.
	 * @param {T} item - The item to add to the stack.
	 * @returns {string} The unique ID generated for the stacked item.
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

			// Notify about eviction for cleanup if a callback is set
			this._onEvict?.(evicted);
		}

		return stackItem.id;
	}

	/**
	 * Removes and returns the item at the top of the stack.
	 * @returns {T|undefined} The data from the top item, or undefined if the stack is empty.
	 */
	pop() {
		if (this.items.length === 0) {
			return undefined;
		}
		const item = this.items.pop();
		return item.data;
	}

	/**
	 * Returns the item at the top of the stack without removing it.
	 * @returns {T|undefined} The data from the top item, or undefined if the stack is empty.
	 */
	peek() {
		if (this.items.length === 0) {
			return undefined;
		}

		return this.items[this.items.length - 1].data;
	}

	/**
	 * Returns the item at a specific index from the top of the stack (0-indexed).
	 * @param {number} index - The index from the top (0 is the most recent item).
	 * @returns {T|undefined} The data of the item at the specified index, or undefined if the index is out of bounds.
	 */
	peekAt(index) {
		if (index < 0 || index >= this.items.length) {
			return undefined;
		}

		const actualIndex = this.items.length - 1 - index;
		return this.items[actualIndex].data;
	}

	/**
	 * Checks if the stack is empty.
	 * @returns {boolean} True if the stack has no items, false otherwise.
	 */
	isEmpty() {
		return this.items.length === 0;
	}

	/**
	 * Checks if the stack has reached its maximum size.
	 * @returns {boolean} True if the stack size is equal to or greater than `maxSize`.
	 */
	isFull() {
		return this.items.length >= this.maxSize;
	}

	/**
	 * Gets the current number of items in the stack.
	 * @type {number}
	 */
	get size() {
		return this.items.length;
	}

	/**
	 * Gets the number of additional items the stack can hold before it becomes full.
	 * @type {number}
	 */
	get remainingCapacity() {
		return this.maxSize - this.items.length;
	}

	/**
	 * Removes all items from the stack.
	 * @returns {number} The number of items that were cleared.
	 */
	clear() {
		const clearedCount = this.items.length;
		this.items = [];
		return clearedCount;
	}

	/**
	 * Returns the stack's items as an array, with the newest items first.
	 * @returns {T[]} An array containing the data of all items in the stack.
	 */
	toArray() {
		return this.items
			.slice()
			.reverse()
			.map((item) => item.data);
	}

	/**
	 * Finds the first item in the stack (from newest to oldest) that satisfies the predicate function.
	 * @param {function(T, number): boolean} predicate - A function to execute on each item's data and index.
	 * It should return a truthy value to indicate a match.
	 * @returns {T|undefined} The data of the first item that matches the predicate, or undefined if no match is found.
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
	 * Creates a new array with all items in the stack that pass the test implemented by the provided predicate function.
	 * @param {function(T, number): boolean} predicate - A function to test each item's data and index.
	 * Return true to keep the element, false otherwise.
	 * @returns {T[]} A new array with the items that pass the test.
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
	 * Retrieves performance and usage metrics for the stack.
	 * @returns {object} An object containing metrics like size, utilization, eviction count, and memory estimates.
	 */
	getMetrics() {
		return {
			size: this.items.length,
			maxSize: this.maxSize,
			utilizationPercent: Math.round(
				(this.items.length / this.maxSize) * 100
			),
			evictionCount: this.evictionCount,
			oldestItemAge:
				this.items.length > 0
					? Date.now() - this.items[0].timestamp
					: 0,
			newestItemAge:
				this.items.length > 0
					? Date.now() - this.items[this.items.length - 1].timestamp
					: 0,
			memoryEstimate: this.estimateMemoryUsage(),
		};
	}

	/**
	 * Estimates the current memory usage of the stack in bytes.
	 * @private
	 * @returns {number} The estimated memory usage in bytes.
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
	 * Provides a rough estimation of an object's size in bytes.
	 * @private
	 * @param {*} obj - The object to estimate the size of.
	 * @returns {number} The estimated size in bytes.
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
			return obj.reduce(
				(sum, item) => sum + this.estimateObjectSize(item),
				0
			);
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
	 * Sets a callback function to be invoked when an item is evicted from the stack.
	 * @param {function(object): void} callback - The function to call with the evicted stack item.
	 */
	set onEvict(callback) {
		this._onEvict = callback;
	}

	/**
	 * Generates a unique ID for a stack item.
	 * @private
	 * @returns {string} A unique identifier string.
	 */
	generateItemId() {
		return `stack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Pushes multiple items onto the stack in a batch.
	 * @param {T[]} items - An array of items to push.
	 * @returns {string[]} An array of unique IDs for the newly added items.
	 */
	pushMultiple(items) {
		const ids = [];
		for (const item of items) {
			ids.push(this.push(item));
		}
		return ids;
	}

	/**
	 * Pops a specified number of items from the top of the stack.
	 * @param {number} count - The number of items to pop.
	 * @returns {T[]} An array of the popped items' data, with the most recent item first.
	 */
	popMultiple(count) {
		const items = [];
		for (let i = 0; i < count && !this.isEmpty(); i++) {
			items.push(this.pop());
		}
		return items;
	}

	/**
	 * Trims the stack to a new, smaller size by removing the oldest items.
	 * @param {number} newSize - The target size for the stack.
	 * @returns {number} The number of items removed.
	 */
	trimTo(newSize) {
		if (newSize >= this.items.length) return 0;

		const removeCount = this.items.length - newSize;
		const removed = this.items.splice(0, removeCount);
		this.evictionCount += removed.length;

		return removed.length;
	}

	/**
	 * Retrieves items from the stack that were pushed within a specific time range.
	 * @param {number} startTime - The start of the time range (Unix timestamp).
	 * @param {number} endTime - The end of the time range (Unix timestamp).
	 * @returns {T[]} An array of item data within the time range, newest first.
	 */
	getItemsInTimeRange(startTime, endTime) {
		return this.items
			.filter(
				(item) =>
					item.timestamp >= startTime && item.timestamp <= endTime
			)
			.map((item) => item.data)
			.reverse(); // Newest first
	}

	/**
	 * Removes all items from the stack that are older than a specified maximum age.
	 * @param {number} maxAge - The maximum age in milliseconds.
	 * @returns {number} The number of items removed.
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
