/**
 * Event Model
 *
 * This implements the "Event" (Verb) concept from our architecture.
 * Events represent actions, commitments, and occurrences.
 *
 * Following MVVM pattern, this is pure business logic with no UI concerns.
 */

import appDb from "../database/db.js";
import TagModel from "./tag.js";
import FieldDefinitionModel from "./field-definition.js";

class EventModel {
	constructor() {
		this.tagModel = new TagModel();
		this.fieldDefModel = new FieldDefinitionModel();
		this.db = appDb;
	}

	/**
	 * Create a new event
	 * @param eventData
	 */
	async create(eventData) {
		try {
			// Validate required fields
			if (!eventData.title || !eventData.content) {
				throw new Error("Title and content are required");
			}

			// Set defaults
			const event = {
				user_id: appDb.getCurrentUserId(),
				event_type_id:
					eventData.event_type_id ||
					(await this.getDefaultEventTypeId()),
				title: eventData.title,
				content: eventData.content,
				status: eventData.status || "todo",
				due_date: eventData.due_date || null,
				project_id: eventData.project_id || null,
				phase_id: eventData.phase_id || null,
				assigned_to_id: eventData.assigned_to_id || null,
			};

			const eventId = await this.db.events.add(event);

			// Handle tags if provided
			if (eventData.tags && eventData.tags.length > 0) {
				await this.assignTags(eventId, eventData.tags);
			}

			return await this.getById(eventId);
		} catch (error) {
			console.error("Failed to create event:", error);
			throw error;
		}
	}

	/**
	 * Get event by ID with related data
	 * @param eventId
	 */
	async getById(eventId) {
		try {
			const event = await this.db.events.get(eventId);
			if (!event) return null;

			// Enrich with related data
			event.event_type = await this.db.event_types.get(
				event.event_type_id
			);
			event.tags = await this.getEventTags(eventId);
			event.links = await this.getEventLinks(eventId);
			event.custom_fields = await this.fieldDefModel.getFieldsForEntity('event', eventId);

			return event;
		} catch (error) {
			console.error("Failed to get event:", error);
			throw error;
		}
	}

	/**
	 * Update an event
	 * @param eventId
	 * @param updateData
	 */
	async update(eventId, updateData) {
		try {
			await this.db.events.update(eventId, updateData);
			return await this.getById(eventId);
		} catch (error) {
			console.error("Failed to update event:", error);
			throw error;
		}
	}

	/**
	 * Delete an event
	 * @param eventId
	 */
	async delete(eventId) {
		try {
			// Remove related data first
			await this.removeAllTags(eventId);
			await this.removeAllLinks(eventId);

			// Delete the event
			await this.db.events.delete(eventId);
			return true;
		} catch (error) {
			console.error("Failed to delete event:", error);
			throw error;
		}
	}

	/**
	 * Query events with filters
	 * @param filters
	 */
	async query(filters = {}) {
		// This refactored query method leverages compound indexes for performance,
		// directly aligning with the architecture's performance goals.
		try {
			const userId = appDb.getCurrentUserId();
			let query;

			// Apply filters
			// Prioritize using compound indexes for performance
			if (filters.status) {
				query = this.db.events
					.where("[user_id+status]")
					.equals([userId, filters.status]);
			} else if (filters.event_type_id) {
				query = this.db.events
					.where("[user_id+event_type_id]")
					.equals([userId, filters.event_type_id]);
			} else {
				query = this.db.events.where("user_id").equals(userId);
			}

			// Apply additional filters that don't have compound indexes
			if (filters.due_date_from || filters.due_date_to) {
				const from = filters.due_date_from
					? new Date(filters.due_date_from)
					: new Date(0);
				const to = filters.due_date_to
					? new Date(filters.due_date_to)
					: new Date(8640000000000000);
				query = query.and(
					(event) =>
						event.due_date &&
						new Date(event.due_date) >= from &&
						new Date(event.due_date) <= to
				);
			}

			if (filters.project_id) {
				query = query.and(
					(event) => event.project_id === filters.project_id
				);
			}

			// Apply sorting
			const sortBy = filters.sort_by || "created_at";
			const sortOrder = filters.sort_order || "desc";

			// Dexie's sortBy is efficient after filtering
			if (sortOrder === "desc") {
				query = query.reverse(); // Apply reverse before sortBy
			}

			const events = await query.sortBy(sortBy);

			// Enrich with basic related data for list views
			for (const event of events) {
				event.event_type = await this.db.event_types.get(
					event.event_type_id
				);
				event.tag_count = await this.getEventTagCount(event.event_id);
			}

			return events;
		} catch (error) {
			console.error("Failed to query events:", error);
			throw error;
		}
	}

	/**
	 * Assign tags to an event
	 * @param eventId
	 * @param tagNames
	 */
	async assignTags(eventId, tagNames) {
		try {
			for (const tagName of tagNames) {
				const tag = await this.tagModel.getOrCreate(tagName);

				// Check if assignment already exists
				const existingAssignment = await this.db.tag_assignments
					.where("[tag_id+taggable_type+taggable_id]")
					.equals([tag.tag_id, "event", eventId])
					.first();

				if (!existingAssignment) {
					await this.db.tag_assignments.add({
						tag_id: tag.tag_id,
						taggable_id: eventId,
						taggable_type: "event",
					});
				}
			}
		} catch (error) {
			console.error("Failed to assign tags:", error);
			throw error;
		}
	}

	/**
	 * Get tags for an event
	 * @param eventId
	 */
	async getEventTags(eventId) {
		try {
			const assignments = await this.db.tag_assignments
				.where("[taggable_type+taggable_id]")
				.equals(["event", eventId])
				.toArray();

			const tags = [];
			for (const assignment of assignments) {
				const tag = await this.db.tags.get(assignment.tag_id);
				if (tag) tags.push(tag);
			}

			return tags;
		} catch (error) {
			console.error("Failed to get event tags:", error);
			return [];
		}
	}

	/**
	 * Get tag count for an event (for performance)
	 * @param eventId
	 */
	async getEventTagCount(eventId) {
		try {
			return await this.db.tag_assignments
				.where("[taggable_type+taggable_id]")
				.equals(["event", eventId])
				.count();
		} catch (error) {
			return 0;
		}
	}

	/**
	 * Get links for an event (bi-directional)
	 * @param eventId
	 */
	async getEventLinks(eventId) {
		try {
			// Get outgoing links
			const outgoing = await this.db.links
				.where("[from_type+from_id]")
				.equals(["event", eventId])
				.toArray();

			// Get incoming links
			const incoming = await this.db.links
				.where("[to_type+to_id]")
				.equals(["event", eventId])
				.toArray();

			return { outgoing, incoming };
		} catch (error) {
			console.error("Failed to get event links:", error);
			return { outgoing: [], incoming: [] };
		}
	}

	/**
	 * Remove all tags from an event
	 * @param eventId
	 */
	async removeAllTags(eventId) {
		try {
			await this.db.tag_assignments
				.where("[taggable_type+taggable_id]")
				.equals(["event", eventId])
				.delete();
		} catch (error) {
			console.error("Failed to remove tags:", error);
		}
	}

	/**
	 * Remove all links from an event
	 * @param eventId
	 */
	async removeAllLinks(eventId) {
		try {
			// Remove as source
			await this.db.links
				.where("[from_type+from_id]")
				.equals(["event", eventId])
				.delete();

			// Remove as target
			await this.db.links
				.where("[to_type+to_id]")
				.equals(["event", eventId])
				.delete();
		} catch (error) {
			console.error("Failed to remove links:", error);
		}
	}

	/**
	 * Get default event type ID (Note)
	 */
	async getDefaultEventTypeId() {
		try {
			const noteType = await this.db.event_types
				.where("name")
				.equals("Note")
				.first();
			return noteType ? noteType.event_type_id : 1;
		} catch (error) {
			return 1; // Fallback
		}
	}
}

export default EventModel;
