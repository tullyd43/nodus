/**
 * Event Model
 * 
 * This implements the "Event" (Verb) concept from our architecture.
 * Events represent actions, commitments, and occurrences.
 * 
 * Following MVVM pattern, this is pure business logic with no UI concerns.
 */

class EventModel {
    constructor() {
        this.db = appDb.getDb();
    }

    /**
     * Create a new event
     */
    async create(eventData) {
        try {
            // Validate required fields
            if (!eventData.title || !eventData.content) {
                throw new Error('Title and content are required');
            }

            // Set defaults
            const event = {
                user_id: appDb.getCurrentUserId(),
                event_type_id: eventData.event_type_id || await this.getDefaultEventTypeId(),
                title: eventData.title,
                content: eventData.content,
                status: eventData.status || 'todo',
                due_date: eventData.due_date || null,
                project_id: eventData.project_id || null,
                phase_id: eventData.phase_id || null,
                assigned_to_id: eventData.assigned_to_id || null
            };

            const eventId = await this.db.events.add(event);
            
            // Handle tags if provided
            if (eventData.tags && eventData.tags.length > 0) {
                await this.assignTags(eventId, eventData.tags);
            }

            return await this.getById(eventId);
        } catch (error) {
            console.error('Failed to create event:', error);
            throw error;
        }
    }

    /**
     * Get event by ID with related data
     */
    async getById(eventId) {
        try {
            const event = await this.db.events.get(eventId);
            if (!event) return null;

            // Enrich with related data
            event.event_type = await this.db.event_types.get(event.event_type_id);
            event.tags = await this.getEventTags(eventId);
            event.links = await this.getEventLinks(eventId);
            event.custom_fields = await this.getEventCustomFields(eventId);

            return event;
        } catch (error) {
            console.error('Failed to get event:', error);
            throw error;
        }
    }

    /**
     * Update an event
     */
    async update(eventId, updateData) {
        try {
            await this.db.events.update(eventId, updateData);
            return await this.getById(eventId);
        } catch (error) {
            console.error('Failed to update event:', error);
            throw error;
        }
    }

    /**
     * Delete an event
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
            console.error('Failed to delete event:', error);
            throw error;
        }
    }

    /**
     * Query events with filters
     */
    async query(filters = {}) {
        try {
            let query = this.db.events.where('user_id').equals(appDb.getCurrentUserId());

            // Apply filters
            if (filters.status) {
                query = query.and(event => event.status === filters.status);
            }

            if (filters.event_type_id) {
                query = query.and(event => event.event_type_id === filters.event_type_id);
            }

            if (filters.due_date_from) {
                query = query.and(event => !event.due_date || new Date(event.due_date) >= new Date(filters.due_date_from));
            }

            if (filters.due_date_to) {
                query = query.and(event => !event.due_date || new Date(event.due_date) <= new Date(filters.due_date_to));
            }

            if (filters.project_id) {
                query = query.and(event => event.project_id === filters.project_id);
            }

            // Apply sorting
            const sortBy = filters.sort_by || 'created_at';
            const sortOrder = filters.sort_order || 'desc';
            
            if (sortOrder === 'desc') {
                query = query.reverse();
            }

            const events = await query.sortBy(sortBy);

            // Enrich with basic related data for list views
            for (const event of events) {
                event.event_type = await this.db.event_types.get(event.event_type_id);
                event.tag_count = await this.getEventTagCount(event.event_id);
            }

            return events;
        } catch (error) {
            console.error('Failed to query events:', error);
            throw error;
        }
    }

    /**
     * Assign tags to an event
     */
    async assignTags(eventId, tagNames) {
        try {
            for (const tagName of tagNames) {
                const tag = await this.getOrCreateTag(tagName);
                
                // Check if assignment already exists
                const existingAssignment = await this.db.tag_assignments
                    .where('[tag_id+taggable_id+taggable_type]')
                    .equals([tag.tag_id, eventId, 'event'])
                    .first();

                if (!existingAssignment) {
                    await this.db.tag_assignments.add({
                        tag_id: tag.tag_id,
                        taggable_id: eventId,
                        taggable_type: 'event'
                    });
                }
            }
        } catch (error) {
            console.error('Failed to assign tags:', error);
            throw error;
        }
    }

    /**
     * Get or create a tag
     */
    async getOrCreateTag(tagName) {
        try {
            // Clean tag name
            const cleanTagName = tagName.toLowerCase().trim().replace(/^#/, '');
            
            let tag = await this.db.tags
                .where('[user_id+tag_name]')
                .equals([appDb.getCurrentUserId(), cleanTagName])
                .first();

            if (!tag) {
                const tagId = await this.db.tags.add({
                    user_id: appDb.getCurrentUserId(),
                    tag_name: cleanTagName
                });
                tag = await this.db.tags.get(tagId);
            }

            return tag;
        } catch (error) {
            console.error('Failed to get or create tag:', error);
            throw error;
        }
    }

    /**
     * Get tags for an event
     */
    async getEventTags(eventId) {
        try {
            const assignments = await this.db.tag_assignments
                .where('[taggable_type+taggable_id]')
                .equals(['event', eventId])
                .toArray();

            const tags = [];
            for (const assignment of assignments) {
                const tag = await this.db.tags.get(assignment.tag_id);
                if (tag) tags.push(tag);
            }

            return tags;
        } catch (error) {
            console.error('Failed to get event tags:', error);
            return [];
        }
    }

    /**
     * Get tag count for an event (for performance)
     */
    async getEventTagCount(eventId) {
        try {
            return await this.db.tag_assignments
                .where('[taggable_type+taggable_id]')
                .equals(['event', eventId])
                .count();
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get links for an event (bi-directional)
     */
    async getEventLinks(eventId) {
        try {
            // Get outgoing links
            const outgoing = await this.db.links
                .where('[source_type+source_id]')
                .equals(['event', eventId])
                .toArray();

            // Get incoming links  
            const incoming = await this.db.links
                .where('[target_type+target_id]')
                .equals(['event', eventId])
                .toArray();

            return { outgoing, incoming };
        } catch (error) {
            console.error('Failed to get event links:', error);
            return { outgoing: [], incoming: [] };
        }
    }

    /**
     * Get custom fields for an event
     */
    async getEventCustomFields(eventId) {
        try {
            return await this.db.custom_field_values
                .where('[object_type+object_id]')
                .equals(['event', eventId])
                .toArray();
        } catch (error) {
            console.error('Failed to get event custom fields:', error);
            return [];
        }
    }

    /**
     * Remove all tags from an event
     */
    async removeAllTags(eventId) {
        try {
            await this.db.tag_assignments
                .where('[taggable_type+taggable_id]')
                .equals(['event', eventId])
                .delete();
        } catch (error) {
            console.error('Failed to remove tags:', error);
        }
    }

    /**
     * Remove all links from an event
     */
    async removeAllLinks(eventId) {
        try {
            // Remove as source
            await this.db.links
                .where('[source_type+source_id]')
                .equals(['event', eventId])
                .delete();

            // Remove as target
            await this.db.links
                .where('[target_type+target_id]')
                .equals(['event', eventId])
                .delete();
        } catch (error) {
            console.error('Failed to remove links:', error);
        }
    }

    /**
     * Get default event type ID (Note)
     */
    async getDefaultEventTypeId() {
        try {
            const noteType = await this.db.event_types
                .where('name')
                .equals('Note')
                .first();
            return noteType ? noteType.event_type_id : 1;
        } catch (error) {
            return 1; // Fallback
        }
    }
}

// Export for use in ViewModels
window.EventModel = EventModel;
