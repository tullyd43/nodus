/**
 * Tag ViewModel
 * 
 * Manages all tag-related state and operations.
 * Handles the universal tagging system that enables cross-context organization.
 */

class TagViewModel {
    constructor() {
        this.tagModel = new TagModel();
        
        // Observable state specific to tags
        this.state = {
            // Data
            tags: [],
            popularTags: [],
            selectedTag: null,
            taggedObjects: null, // Objects with the selected tag
            
            // UI State
            isLoading: false,
            isCreating: false,
            isDeleting: false,
            
            // Search & Filter
            searchQuery: '',
            searchResults: [],
            
            // Tag suggestions for autocomplete
            suggestions: [],
            
            // Statistics
            tagStats: {}
        };
        
        // Event listeners
        this.listeners = {
            stateChange: [],
            tagsChange: [],
            tagCreated: [],
            tagDeleted: [],
            tagSelected: [],
            suggestionsChange: []
        };
    }

    // === STATE MANAGEMENT ===

    setState(newState) {
        const previousState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        // Notify listeners
        this.notifyListeners('stateChange', { 
            previousState, 
            currentState: this.state,
            changes: newState 
        });

        // Specific notifications
        if (newState.tags !== undefined) {
            this.notifyListeners('tagsChange', this.state.tags);
        }
        
        if (newState.suggestions !== undefined) {
            this.notifyListeners('suggestionsChange', this.state.suggestions);
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
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    notifyListeners(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in TagViewModel ${event} listener:`, error);
                }
            });
        }
    }

    // === DATA OPERATIONS ===

    async loadTags() {
        try {
            this.setState({ isLoading: true });
            
            const tags = await this.tagModel.getAllTags();
            
            this.setState({ 
                tags,
                isLoading: false
            });
            
            return tags;
        } catch (error) {
            console.error('Failed to load tags:', error);
            this.setState({ isLoading: false });
            throw error;
        }
    }

    async loadPopularTags(limit = 10) {
        try {
            const popularTags = await this.tagModel.getPopularTags(limit);
            
            this.setState({ popularTags });
            
            return popularTags;
        } catch (error) {
            console.error('Failed to load popular tags:', error);
            throw error;
        }
    }

    async createTag(tagName) {
        try {
            this.setState({ isCreating: true });
            
            // Tags are created implicitly through the EventModel
            // but we can trigger a reload to see new tags
            await this.loadTags();
            
            this.setState({ isCreating: false });
            this.notifyListeners('tagCreated', tagName);
            
            return tagName;
        } catch (error) {
            console.error('Failed to create tag:', error);
            this.setState({ isCreating: false });
            throw error;
        }
    }

    async deleteTag(tagId) {
        try {
            this.setState({ isDeleting: true });
            
            await this.tagModel.deleteTag(tagId);
            
            // Remove from current list
            const tags = this.state.tags.filter(tag => tag.tag_id !== tagId);
            
            this.setState({ 
                tags,
                isDeleting: false,
                selectedTag: this.state.selectedTag?.tag_id === tagId ? null : this.state.selectedTag
            });
            
            this.notifyListeners('tagDeleted', tagId);
            
            return true;
        } catch (error) {
            console.error('Failed to delete tag:', error);
            this.setState({ isDeleting: false });
            throw error;
        }
    }

    async renameTag(tagId, newName) {
        try {
            const updatedTag = await this.tagModel.renameTag(tagId, newName);
            
            // Update in current list
            const tags = this.state.tags.map(tag => 
                tag.tag_id === tagId ? updatedTag : tag
            );
            
            this.setState({ 
                tags,
                selectedTag: this.state.selectedTag?.tag_id === tagId ? updatedTag : this.state.selectedTag
            });
            
            return updatedTag;
        } catch (error) {
            console.error('Failed to rename tag:', error);
            throw error;
        }
    }

    async mergeTags(sourceTagId, targetTagId) {
        try {
            await this.tagModel.mergeTags(sourceTagId, targetTagId);
            
            // Reload tags to reflect the merge
            await this.loadTags();
            
            return true;
        } catch (error) {
            console.error('Failed to merge tags:', error);
            throw error;
        }
    }

    // === TAG SELECTION & ANALYSIS ===

    async selectTag(tagId) {
        try {
            const tag = this.state.tags.find(t => t.tag_id === tagId);
            if (!tag) {
                throw new Error('Tag not found');
            }

            this.setState({ selectedTag: tag });

            // Load objects with this tag
            const taggedObjects = await this.tagModel.getObjectsWithTag(tagId);
            const tagStats = await this.tagModel.getTagStats(tagId);

            this.setState({ 
                taggedObjects,
                tagStats: { ...this.state.tagStats, [tagId]: tagStats }
            });

            this.notifyListeners('tagSelected', { tag, taggedObjects, tagStats });

            return { tag, taggedObjects, tagStats };
        } catch (error) {
            console.error('Failed to select tag:', error);
            throw error;
        }
    }

    clearTagSelection() {
        this.setState({ 
            selectedTag: null,
            taggedObjects: null
        });
    }

    async getTagStats(tagId) {
        try {
            const stats = await this.tagModel.getTagStats(tagId);
            
            this.setState({
                tagStats: { ...this.state.tagStats, [tagId]: stats }
            });
            
            return stats;
        } catch (error) {
            console.error('Failed to get tag stats:', error);
            throw error;
        }
    }

    // === SEARCH & SUGGESTIONS ===

    async searchTags(query) {
        try {
            this.setState({ searchQuery: query });
            
            if (!query.trim()) {
                this.setState({ searchResults: [] });
                return [];
            }

            const results = await this.tagModel.searchTags(query);
            
            this.setState({ searchResults: results });
            return results;
        } catch (error) {
            console.error('Failed to search tags:', error);
            throw error;
        }
    }

    async generateSuggestions(input = '') {
        try {
            // Simple suggestion logic - in a real app you might use more sophisticated algorithms
            let suggestions = [];
            
            if (input.trim()) {
                // Find tags that match the input
                suggestions = await this.tagModel.searchTags(input);
            } else {
                // Show popular tags when no input
                suggestions = this.state.popularTags.slice(0, 5);
            }
            
            this.setState({ suggestions });
            return suggestions;
        } catch (error) {
            console.error('Failed to generate suggestions:', error);
            return [];
        }
    }

    // === TAG PARSING & EXTRACTION ===

    extractTagsFromText(text) {
        const hashtagMatches = text.match(/#\w+/g);
        if (!hashtagMatches) return [];
        
        return hashtagMatches.map(tag => tag.substring(1).toLowerCase());
    }

    cleanTagName(tagName) {
        return tagName.toLowerCase().trim().replace(/^#/, '');
    }

    formatTagForDisplay(tagName) {
        return `#${tagName}`;
    }

    // === TAG ANALYSIS ===

    async getTagInsights() {
        try {
            const tags = this.state.tags;
            const insights = {
                totalTags: tags.length,
                mostUsedTags: [],
                recentTags: [],
                unusedTags: [],
                tagGrowth: {}
            };

            // Get stats for all tags
            for (const tag of tags) {
                const stats = await this.tagModel.getTagStats(tag.tag_id);
                tag.usage_count = stats.total_usage;
            }

            // Most used tags
            insights.mostUsedTags = tags
                .filter(tag => tag.usage_count > 0)
                .sort((a, b) => b.usage_count - a.usage_count)
                .slice(0, 10);

            // Unused tags
            insights.unusedTags = tags.filter(tag => tag.usage_count === 0);

            // Recent tags (created in last 7 days)
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            insights.recentTags = tags.filter(tag => 
                new Date(tag.created_at) > weekAgo
            );

            return insights;
        } catch (error) {
            console.error('Failed to get tag insights:', error);
            throw error;
        }
    }

    // === INITIALIZATION ===

    async initialize() {
        try {
            await this.loadTags();
            await this.loadPopularTags();
            await this.generateSuggestions();
            console.log('TagViewModel initialized successfully');
        } catch (error) {
            console.error('Failed to initialize TagViewModel:', error);
            throw error;
        }
    }

    // === BULK OPERATIONS ===

    async bulkDeleteTags(tagIds) {
        try {
            this.setState({ isDeleting: true });
            
            for (const tagId of tagIds) {
                await this.tagModel.deleteTag(tagId);
            }
            
            // Reload tags
            await this.loadTags();
            
            this.setState({ isDeleting: false });
            
            return true;
        } catch (error) {
            console.error('Failed to bulk delete tags:', error);
            this.setState({ isDeleting: false });
            throw error;
        }
    }

    async cleanupUnusedTags() {
        try {
            const insights = await this.getTagInsights();
            const unusedTagIds = insights.unusedTags.map(tag => tag.tag_id);
            
            if (unusedTagIds.length > 0) {
                await this.bulkDeleteTags(unusedTagIds);
            }
            
            return unusedTagIds.length;
        } catch (error) {
            console.error('Failed to cleanup unused tags:', error);
            throw error;
        }
    }
}

// Export for use in the app
window.TagViewModel = TagViewModel;
