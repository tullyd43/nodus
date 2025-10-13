/**
 * Item ViewModel
 *
 * Manages all item-related state and operations.
 * Items represent quantifiable, trackable assets (the "Nouns" in our architecture).
 */

import appDb from "../database/db.js";
import ItemModel from "../models/item.js";

class ItemViewModel {
	constructor() {
		this.itemModel = new ItemModel();

		// Observable state specific to items
		this.state = {
			// Data
			items: [],
			selectedItem: null,
			itemTypes: [],

			// UI State
			isLoading: false,
			isCreating: false,
			isUpdating: false,

			// Filters specific to items
			filters: {
				item_type_id: null,
				low_stock: false,
				low_stock_threshold: 5,
			},

			// Search
			searchQuery: "",
			searchResults: [],

			// Inventory management
			lowStockItems: [],
			stockAlerts: [],

			// Consumption tracking
			consumptionHistory: [],

			// Pagination
			currentPage: 1,
			pageSize: 50,
			totalCount: 0,
		};

		// Event listeners
		this.listeners = {
			stateChange: [],
			itemsChange: [],
			itemCreated: [],
			itemUpdated: [],
			itemDeleted: [],
			stockAlert: [],
			filtersChange: [],
		};
	}

	// === STATE MANAGEMENT ===

	setState(newState) {
		const previousState = { ...this.state };
		this.state = { ...this.state, ...newState };

		// Notify listeners
		this.notifyListeners("stateChange", {
			previousState,
			currentState: this.state,
			changes: newState,
		});

		// Specific notifications
		if (newState.items !== undefined) {
			this.notifyListeners("itemsChange", this.state.items);
			this.checkStockLevels();
		}

		if (newState.filters !== undefined) {
			this.notifyListeners("filtersChange", this.state.filters);
		}
	}

	getState() {
		return { ...this.state };
	}

	// === EVENT LISTENERS ===

	on(event, callback) {
		if (!this.listeners[event]) {
			this.listeners[event] = [];
		}
		this.listeners[event].push(callback);
	}

	off(event, callback) {
		if (this.listeners[event]) {
			this.listeners[event] = this.listeners[event].filter(
				(cb) => cb !== callback
			);
		}
	}

	notifyListeners(event, data) {
		if (this.listeners[event]) {
			this.listeners[event].forEach((callback) => {
				try {
					callback(data);
				} catch (error) {
					console.error(
						`Error in ItemViewModel ${event} listener:`,
						error
					);
				}
			});
		}
	}

	// === DATA OPERATIONS ===

	async loadItems() {
		try {
			this.setState({ isLoading: true });

			const items = await this.itemModel.query({
				...this.state.filters,
				page: this.state.currentPage,
				pageSize: this.state.pageSize,
			});

			this.setState({
				items,
				isLoading: false,
				totalCount: items.length,
			});

			return items;
		} catch (error) {
			console.error("Failed to load items:", error);
			this.setState({ isLoading: false });
			throw error;
		}
	}

	async loadItemTypes() {
		try {
			// Get item types from database
			const itemTypes = await appDb.item_types
				.where("user_id")
				.equals(appDb.getCurrentUserId())
				.toArray();

			this.setState({ itemTypes });
			return itemTypes;
		} catch (error) {
			console.error("Failed to load item types:", error);
			throw error;
		}
	}

	async createItem(itemData) {
		try {
			this.setState({ isCreating: true });

			const newItem = await this.itemModel.create(itemData);

			// Reload items to reflect the change
			await this.loadItems();

			this.setState({ isCreating: false });
			this.notifyListeners("itemCreated", newItem);

			return newItem;
		} catch (error) {
			console.error("Failed to create item:", error);
			this.setState({ isCreating: false });
			throw error;
		}
	}

	async updateItem(itemId, updateData) {
		try {
			this.setState({ isUpdating: true });

			const updatedItem = await this.itemModel.update(itemId, updateData);

			// Update the item in the current list
			const items = this.state.items.map((item) =>
				item.item_id === itemId ? updatedItem : item
			);

			this.setState({
				items,
				isUpdating: false,
				selectedItem: updatedItem,
			});

			this.notifyListeners("itemUpdated", updatedItem);

			return updatedItem;
		} catch (error) {
			console.error("Failed to update item:", error);
			this.setState({ isUpdating: false });
			throw error;
		}
	}

	async deleteItem(itemId) {
		try {
			await this.itemModel.delete(itemId);

			// Remove from current list
			const items = this.state.items.filter(
				(item) => item.item_id !== itemId
			);

			this.setState({
				items,
				selectedItem:
					this.state.selectedItem?.item_id === itemId
						? null
						: this.state.selectedItem,
			});

			this.notifyListeners("itemDeleted", itemId);

			return true;
		} catch (error) {
			console.error("Failed to delete item:", error);
			throw error;
		}
	}

	async getItemById(itemId) {
		try {
			const item = await this.itemModel.getById(itemId);
			return item;
		} catch (error) {
			console.error("Failed to get item:", error);
			throw error;
		}
	}

	// === SELECTION ===

	selectItem(itemId) {
		const item = this.state.items.find((i) => i.item_id === itemId);
		this.setState({ selectedItem: item });
	}

	clearSelection() {
		this.setState({ selectedItem: null });
	}

	// === INVENTORY MANAGEMENT ===

	async updateStock(itemId, newQuantity, reason = "manual_update") {
		try {
			const item = await this.getItemById(itemId);
			if (!item) throw new Error("Item not found");

			const oldQuantity = item.stock_quantity;

			await this.updateItem(itemId, {
				stock_quantity: newQuantity,
				last_stock_update: new Date(),
				last_stock_reason: reason,
			});

			// Log the stock change
			await this.logStockChange(itemId, oldQuantity, newQuantity, reason);

			return true;
		} catch (error) {
			console.error("Failed to update stock:", error);
			throw error;
		}
	}

	async consumeItem(itemId, quantity, reason = "consumption") {
		try {
			const item = await this.getItemById(itemId);
			if (!item) throw new Error("Item not found");

			if (item.stock_quantity < quantity) {
				throw new Error("Insufficient stock");
			}

			const newQuantity = item.stock_quantity - quantity;
			return await this.updateStock(itemId, newQuantity, reason);
		} catch (error) {
			console.error("Failed to consume item:", error);
			throw error;
		}
	}

	async restockItem(itemId, quantity, reason = "restock") {
		try {
			const item = await this.getItemById(itemId);
			if (!item) throw new Error("Item not found");

			const newQuantity = item.stock_quantity + quantity;
			return await this.updateStock(itemId, newQuantity, reason);
		} catch (error) {
			console.error("Failed to restock item:", error);
			throw error;
		}
	}

	async logStockChange(itemId, oldQuantity, newQuantity, reason) {
		try {
			// In a real app, you'd have a stock_changes table
			// For now, we'll use the audit log system
			console.log(
				`Stock change: Item ${itemId}: ${oldQuantity} → ${newQuantity} (${reason})`
			);
		} catch (error) {
			console.error("Failed to log stock change:", error);
		}
	}

	async checkStockLevels() {
		try {
			const lowStockItems = this.state.items.filter(
				(item) =>
					item.stock_quantity <=
					this.state.filters.low_stock_threshold
			);

			// Check for new low stock alerts
			const newAlerts = lowStockItems.filter(
				(item) =>
					!this.state.lowStockItems.find(
						(existing) => existing.item_id === item.item_id
					)
			);

			this.setState({ lowStockItems });

			// Notify about new alerts
			newAlerts.forEach((item) => {
				this.notifyListeners("stockAlert", {
					type: "low_stock",
					item,
					message: `${item.name} is running low (${item.stock_quantity} remaining)`,
				});
			});
		} catch (error) {
			console.error("Failed to check stock levels:", error);
		}
	}

	// === FILTERING & SEARCH ===

	async applyFilters(newFilters) {
		try {
			const updatedFilters = { ...this.state.filters, ...newFilters };
			this.setState({
				filters: updatedFilters,
				currentPage: 1, // Reset to first page when filtering
			});
			await this.loadItems();
		} catch (error) {
			console.error("Failed to apply filters:", error);
			throw error;
		}
	}

	async clearFilters() {
		const clearedFilters = {
			item_type_id: null,
			low_stock: false,
			low_stock_threshold: 5,
		};

		await this.applyFilters(clearedFilters);
	}

	async search(query) {
		try {
			this.setState({ searchQuery: query });

			if (!query.trim()) {
				this.setState({ searchResults: [] });
				return [];
			}

			// Simple search implementation
			const allItems = await this.itemModel.query({});
			const results = allItems.filter(
				(item) =>
					item.name.toLowerCase().includes(query.toLowerCase()) ||
					(item.description &&
						item.description
							.toLowerCase()
							.includes(query.toLowerCase()))
			);

			this.setState({ searchResults: results });
			return results;
		} catch (error) {
			console.error("Failed to search items:", error);
			throw error;
		}
	}

	// === QUICK ACTIONS ===

	async quickAddItem(name, quantity = 0) {
		try {
			const itemData = {
				name: name.trim(),
				stock_quantity: quantity,
				description: `Quick-added item: ${name}`,
			};

			return await this.createItem(itemData);
		} catch (error) {
			console.error("Failed to quick add item:", error);
			throw error;
		}
	}

	// === ANALYTICS & INSIGHTS ===

	getInventoryStats() {
		const items = this.state.items;

		return {
			totalItems: items.length,
			totalStockValue: items.reduce(
				(sum, item) => sum + (item.stock_quantity || 0),
				0
			),
			lowStockCount: this.state.lowStockItems.length,
			outOfStockCount: items.filter((item) => item.stock_quantity === 0)
				.length,
			averageStockLevel:
				items.length > 0
					? items.reduce(
							(sum, item) => sum + (item.stock_quantity || 0),
							0
					  ) / items.length
					: 0,
			itemsByType: this.groupItemsByType(),
		};
	}

	groupItemsByType() {
		const grouped = {};
		this.state.items.forEach((item) => {
			const typeName = item.item_type?.name || "Unknown";
			if (!grouped[typeName]) {
				grouped[typeName] = [];
			}
			grouped[typeName].push(item);
		});
		return grouped;
	}

	getOutOfStockItems() {
		try {
			const outOfStockItems = this.state.items.filter(
				(item) => item.stock_quantity === 0
			);
			this.setState({ outOfStockItems });
			return outOfStockItems;
		} catch (error) {
			console.error("Failed to get out of stock items:", error);
			throw error;
		}
	}

	// === PAGINATION ===

	async goToPage(page) {
		if (page < 1) return;

		this.setState({ currentPage: page });
		await this.loadItems();
	}

	async nextPage() {
		const maxPage = Math.ceil(this.state.totalCount / this.state.pageSize);
		if (this.state.currentPage < maxPage) {
			await this.goToPage(this.state.currentPage + 1);
		}
	}

	async previousPage() {
		if (this.state.currentPage > 1) {
			await this.goToPage(this.state.currentPage - 1);
		}
	}

	// === INITIALIZATION ===

	async initialize() {
		try {
			await this.loadItemTypes();
			await this.loadItems();
			console.log("ItemViewModel initialized successfully");
		} catch (error) {
			console.error("Failed to initialize ItemViewModel:", error);
			throw error;
		}
	}

	// === TEST HELPERS ===

	async createTestItem() {
		const testItems = [
			{
				name: "Printer Paper",
				description: "A4 white printer paper",
				stock_quantity: 50,
				tags: ["office", "supplies"],
			},
			{
				name: "Coffee Beans",
				description: "Premium Arabica coffee beans",
				stock_quantity: 2,
				tags: ["kitchen", "consumable"],
			},
			{
				name: "Laptop Charger",
				description: "MacBook Pro charger",
				stock_quantity: 1,
				tags: ["electronics", "tech"],
			},
		];

		const randomItem =
			testItems[Math.floor(Math.random() * testItems.length)];
		return await this.createItem(randomItem);
	}

	// === IMPORT/EXPORT ===

	async importItems(itemsData) {
		try {
			this.setState({ isLoading: true });

			const createdItems = [];
			for (const itemData of itemsData) {
				try {
					const item = await this.createItem(itemData);
					createdItems.push(item);
				} catch (error) {
					console.warn("Failed to import item:", itemData, error);
				}
			}

			this.setState({ isLoading: false });
			return createdItems;
		} catch (error) {
			console.error("Failed to import items:", error);
			this.setState({ isLoading: false });
			throw error;
		}
	}

	async exportItems() {
		try {
			const items = await this.itemModel.query({});

			// Convert to export format
			const exportData = items.map((item) => ({
				name: item.name,
				description: item.description,
				stock_quantity: item.stock_quantity,
				item_type: item.item_type?.name,
				tags: item.tags?.map((tag) => tag.tag_name),
				created_at: item.created_at,
			}));

			return exportData;
		} catch (error) {
			console.error("Failed to export items:", error);
			throw error;
		}
	}
}

export default ItemViewModel;
