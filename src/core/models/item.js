/**
 * Item Model
 *
 * This implements the "Item" (Noun) concept from our architecture.
 * Items represent quantifiable, trackable assets.
 */

import appDb from "../database/db.js";
import TagModel from "./tag.js";

class ItemModel {
	constructor() {
		this.tagModel = new TagModel();
		this.db = appDb;
	}

	/**
	 * Create a new item
	 * @param itemData
	 */
	async create(itemData) {
		try {
			if (!itemData.name) {
				throw new Error("Name is required");
			}

			const item = {
				user_id: appDb.getCurrentUserId(),
				item_type_id:
					itemData.item_type_id ||
					(await this.getDefaultItemTypeId()),
				name: itemData.name,
				description: itemData.description || "",
				stock_quantity: itemData.stock_quantity || 0,
				metadata: itemData.metadata || {},
			};

			const itemId = await this.db.items.add(item);

			// Handle tags if provided
			if (itemData.tags && itemData.tags.length > 0) {
				await this.assignTags(itemId, itemData.tags);
			}

			return await this.getById(itemId);
		} catch (error) {
			console.error("Failed to create item:", error);
			throw error;
		}
	}

	/**
	 * Get item by ID with related data
	 * @param itemId
	 */
	async getById(itemId) {
		try {
			const item = await this.db.items.get(itemId);
			if (!item) return null;

			// Enrich with related data
			item.item_type = await this.db.item_types.get(item.item_type_id);
			item.tags = await this.getItemTags(itemId);

			return item;
		} catch (error) {
			console.error("Failed to get item:", error);
			throw error;
		}
	}

	/**
	 * Update an item
	 * @param itemId
	 * @param updateData
	 */
	async update(itemId, updateData) {
		try {
			await this.db.items.update(itemId, updateData);
			return await this.getById(itemId);
		} catch (error) {
			console.error("Failed to update item:", error);
			throw error;
		}
	}

	/**
	 * Delete an item
	 * @param itemId
	 */
	async delete(itemId) {
		try {
			// Remove related data first (tags, links, etc.)
			await this.removeAllTags(itemId);

			// Delete the item
			await this.db.items.delete(itemId);
			return true;
		} catch (error) {
			console.error("Failed to delete item:", error);
			throw error;
		}
	}

	/**
	 * Query items with filters
	 * @param filters
	 */
	async query(filters = {}) {
		try {
			let query = this.db.items
				.where("user_id")
				.equals(appDb.getCurrentUserId());

			// Apply filters
			if (filters.item_type_id) {
				query = query.and(
					(item) => item.item_type_id === filters.item_type_id
				);
			}

			if (filters.low_stock) {
				query = query.and(
					(item) =>
						item.stock_quantity <=
						(filters.low_stock_threshold || 5)
				);
			}

			const items = await query.toArray();

			// Enrich with basic related data
			for (const item of items) {
				item.item_type = await this.db.item_types.get(
					item.item_type_id
				);
				item.tags = await this.getItemTags(item.item_id);
			}

			return items;
		} catch (error) {
			console.error("Failed to query items:", error);
			throw error;
		}
	}

	/**
	 * Assign tags to an item (reuses tag logic from EventModel)
	 * @param itemId
	 * @param tagNames
	 */
	async assignTags(itemId, tagNames) {
		try {
			for (const tagName of tagNames) {
				const tag = await this.tagModel.getOrCreate(tagName);

				const existingAssignment = await this.db.tag_assignments
					.where("[tag_id+taggable_type+taggable_id]")
					.equals([tag.tag_id, "item", itemId])
					.first();

				if (!existingAssignment) {
					await this.db.tag_assignments.add({
						tag_id: tag.tag_id,
						taggable_id: itemId,
						taggable_type: "item",
					});
				}
			}
		} catch (error) {
			console.error("Failed to assign tags to item:", error);
			throw error;
		}
	}

	/**
	 * Get tags for an item
	 * @param itemId
	 */
	async getItemTags(itemId) {
		try {
			const assignments = await this.db.tag_assignments
				.where("[taggable_type+taggable_id]")
				.equals(["item", itemId])
				.toArray();

			const tags = [];
			for (const assignment of assignments) {
				const tag = await this.db.tags.get(assignment.tag_id);
				if (tag) tags.push(tag);
			}

			return tags;
		} catch (error) {
			console.error("Failed to get item tags:", error);
			return [];
		}
	}

	/**
	 * Get tag count for an item
	 * @param itemId
	 */
	async getItemTagCount(itemId) {
		try {
			return await this.db.tag_assignments
				.where("[taggable_type+taggable_id]")
				.equals(["item", itemId])
				.count();
		} catch (error) {
			return 0;
		}
	}

	/**
	 * Remove all tags from an item
	 * @param itemId
	 */
	async removeAllTags(itemId) {
		try {
			await this.db.tag_assignments
				.where("[taggable_type+taggable_id]")
				.equals(["item", itemId])
				.delete();
		} catch (error) {
			console.error("Failed to remove tags from item:", error);
		}
	}

	/**
	 * Get default item type ID
	 */
	async getDefaultItemTypeId() {
		try {
			const defaultType = await this.db.item_types
				.where("name")
				.equals("Consumable")
				.first();
			return defaultType ? defaultType.item_type_id : 1;
		} catch (error) {
			return 1;
		}
	}
}

export default ItemModel;
