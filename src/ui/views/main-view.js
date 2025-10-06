/**
 * Main View
 * 
 * Handles all UI rendering, DOM manipulation, and user interactions.
 * Binds to ViewModels and responds to state changes.
 * NO BUSINESS LOGIC - only UI concerns.
 */

class MainView {
    constructor(appViewModel) {
        this.appViewModel = appViewModel;
        
        // UI element references
        this.ui = {
            status: document.getElementById('status'),
            captureInput: document.getElementById('capture-input'),
            captureSubmit: document.getElementById('capture-submit'),
            testInsert: document.getElementById('test-insert'),
            testQuery: document.getElementById('test-query'),
            clearDb: document.getElementById('clear-db'),
            testResults: document.getElementById('test-results')
        };
        
        // Child Views (future)
        this.eventView = null;
        this.tagView = null;
        this.itemView = null;
    }

    /**
     * Initialize the view - set up all UI bindings and listeners
     */
    initialize() {
        this.setupUIEventListeners();
        this.setupViewModelListeners();
        console.log('MainView initialized');
    }

    // === UI EVENT LISTENERS ===

    setupUIEventListeners() {
        // Quick capture functionality
        this.ui.captureSubmit.addEventListener('click', () => {
            this.handleQuickCapture();
        });

        this.ui.captureInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleQuickCapture();
            }
        });

        // Test buttons
        this.ui.testInsert.addEventListener('click', () => {
            this.handleTestInsert();
        });

        this.ui.testQuery.addEventListener('click', () => {
            this.handleTestQuery();
        });

        this.ui.clearDb.addEventListener('click', () => {
            this.handleClearDatabase();
        });

        // Update capture text in EventViewModel as user types
        this.ui.captureInput.addEventListener('input', (e) => {
            this.appViewModel.getEventViewModel().setCaptureText(e.target.value);
        });
    }

    // === VIEWMODEL LISTENERS ===

    setupViewModelListeners() {
        // Listen for app-wide state changes
        this.appViewModel.on('stateChange', (data) => {
            this.handleAppStateChange(data);
        });

        // Listen for notifications
        this.appViewModel.on('notification', (notification) => {
            this.showNotification(notification.message, notification.type);
        });

        // Listen for errors
        this.appViewModel.on('error', (error) => {
            console.error('App Error:', error);
        });

        // Listen for EventViewModel changes
        const eventVM = this.appViewModel.getEventViewModel();
        
        eventVM.on('stateChange', (data) => {
            this.handleEventStateChange(data);
        });

        eventVM.on('eventsChange', (events) => {
            this.updateStatus(`Ready! ${events.length} events in database`);
        });

        // Listen for TagViewModel changes
        const tagVM = this.appViewModel.getTagViewModel();
        
        tagVM.on('tagsChange', (tags) => {
            console.log(`Tags updated: ${tags.length} total tags`);
        });

        // Listen for ItemViewModel changes
        const itemVM = this.appViewModel.getItemViewModel();
        
        itemVM.on('itemsChange', (items) => {
            console.log(`Items updated: ${items.length} total items`);
        });

        itemVM.on('stockAlert', (alert) => {
            this.showNotification(alert.message, 'warning', 5000);
        });
    }

    // === STATE CHANGE HANDLERS ===

    handleAppStateChange(data) {
        const { changes } = data;
        
        // Update loading state
        if (changes.isLoading !== undefined) {
            if (changes.isLoading) {
                this.updateStatus('Loading...');
            }
        }

        // Handle view changes
        if (changes.currentView !== undefined) {
            this.handleViewChange(changes.currentView);
        }

        // Handle route changes
        if (changes.currentRoute !== undefined) {
            this.handleRouteChange(changes.currentRoute);
        }
    }

    handleEventStateChange(data) {
        const { changes } = data;
        
        // Update capture input state
        if (changes.isCaptureProcessing !== undefined) {
            this.ui.captureSubmit.disabled = changes.isCaptureProcessing;
            this.ui.captureSubmit.textContent = changes.isCaptureProcessing ? 'Processing...' : 'Capture';
        }

        // Clear capture input when text is cleared
        if (changes.captureText === '') {
            this.ui.captureInput.value = '';
        }

        // Update loading states
        if (changes.isLoading !== undefined) {
            this.updateLoadingState('events', changes.isLoading);
        }
    }

    handleViewChange(newView) {
        console.log(`View changed to: ${newView}`);
        // Future: Update UI to reflect view change
        // This is where you'd show/hide different UI sections
    }

    handleRouteChange(newRoute) {
        console.log(`Route changed to: ${newRoute}`);
        // Future: Update navigation state, breadcrumbs, etc.
    }

    // === USER ACTION HANDLERS ===

    async handleQuickCapture() {
        try {
            const text = this.ui.captureInput.value.trim();
            if (!text) return;

            await this.appViewModel.quickCapture(text);
            
            // Success is handled by the notification system now
            
        } catch (error) {
            console.error('Quick capture failed:', error);
            // Error is handled by the AppViewModel error system
        }
    }

    async handleTestInsert() {
        try {
            await this.appViewModel.createTestData();
        } catch (error) {
            console.error('Test insert failed:', error);
        }
    }

    async handleTestQuery() {
        try {
            const events = this.appViewModel.getEvents();
            const tags = this.appViewModel.getTags();
            const items = this.appViewModel.getItems();
            
            const html = this.buildQueryResultsHTML(events, tags, items);
            this.ui.testResults.innerHTML = html;
            
        } catch (error) {
            console.error('Test query failed:', error);
        }
    }

    async handleClearDatabase() {
        try {
            const cleared = await this.appViewModel.clearAllData();
            if (cleared) {
                this.ui.testResults.innerHTML = '';
            }
        } catch (error) {
            console.error('Clear database failed:', error);
        }
    }

    // === UI UPDATE METHODS ===

    updateStatus(message) {
        this.ui.status.textContent = message;
        console.log('Status:', message);
    }

    updateLoadingState(section, isLoading) {
        // Future: Update specific UI sections with loading indicators
        console.log(`${section} loading state: ${isLoading}`);
    }

    showNotification(message, type = 'info', duration = 3000) {
        // Create notification element
        const messageDiv = document.createElement('div');
        messageDiv.textContent = message;
        messageDiv.className = `notification notification--${type}`;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            background: ${this.getNotificationColor(type)};
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease-out;
        `;

        // Add animation styles if not already present
        this.ensureNotificationStyles();

        document.body.appendChild(messageDiv);

        // Auto-remove after duration
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                messageDiv.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => {
                    if (document.body.contains(messageDiv)) {
                        document.body.removeChild(messageDiv);
                    }
                }, 300);
            }
        }, duration);

        console.log(`${type.toUpperCase()}: ${message}`);
    }

    getNotificationColor(type) {
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196F3'
        };
        return colors[type] || colors.info;
    }

    ensureNotificationStyles() {
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // === HTML BUILDERS ===

    buildQueryResultsHTML(events, tags, items) {
        let html = '<h3>Query Results:</h3>';
        
        if (events.length === 0 && items.length === 0) {
            html += '<p>No data found. Try creating some first!</p>';
        } else {
            // Show Events
            if (events.length > 0) {
                html += this.buildEventsHTML(events);
            }

            // Show Items
            if (items.length > 0) {
                html += this.buildItemsHTML(items);
            }
        }

        // Show tag statistics
        if (tags.length > 0) {
            html += this.buildTagsHTML(tags);
        }

        // Show MVVM structure info
        html += this.buildMVVMInfoHTML(events.length, tags.length, items.length);

        return html;
    }

    buildEventsHTML(events) {
        let html = '<h4>Events:</h4><ul>';
        for (const event of events) {
            const tagsList = event.tags ? event.tags.map(t => `#${t.tag_name}`).join(' ') : '';
            const eventType = event.event_type ? event.event_type.name : 'Unknown';
            const dueDate = event.due_date ? new Date(event.due_date).toLocaleDateString() : 'No due date';
            
            html += `
                <li>
                    <strong>${this.escapeHtml(event.title)}</strong> (${this.escapeHtml(eventType)})<br>
                    Status: ${this.escapeHtml(event.status)}<br>
                    Due: ${dueDate}<br>
                    Tags: ${this.escapeHtml(tagsList) || 'None'}<br>
                    <small>Created: ${new Date(event.created_at).toLocaleString()}</small>
                </li>
            `;
        }
        html += '</ul>';
        return html;
    }

    buildItemsHTML(items) {
        let html = '<h4>Items:</h4><ul>';
        for (const item of items) {
            const tagsList = item.tags ? item.tags.map(t => `#${t.tag_name}`).join(' ') : '';
            const itemType = item.item_type ? item.item_type.name : 'Unknown';
            
            html += `
                <li>
                    <strong>${this.escapeHtml(item.name)}</strong> (${this.escapeHtml(itemType)})<br>
                    Stock: ${item.stock_quantity || 0}<br>
                    Description: ${this.escapeHtml(item.description) || 'None'}<br>
                    Tags: ${this.escapeHtml(tagsList) || 'None'}<br>
                    <small>Created: ${new Date(item.created_at).toLocaleString()}</small>
                </li>
            `;
        }
        html += '</ul>';
        return html;
    }

    buildTagsHTML(tags) {
        let html = '<h4>Tags:</h4><ul>';
        tags.forEach(tag => {
            html += `<li>#${this.escapeHtml(tag.tag_name)}</li>`;
        });
        html += '</ul>';
        return html;
    }

    buildMVVMInfoHTML(eventCount, tagCount, itemCount) {
        let html = '<h4>MVVM Structure:</h4>';
        html += '<ul>';
        html += `<li><strong>AppViewModel:</strong> Coordinating ${this.appViewModel.getState().currentRoute} route</li>`;
        html += `<li><strong>EventViewModel:</strong> Managing ${eventCount} events</li>`;
        html += `<li><strong>TagViewModel:</strong> Managing ${tagCount} tags</li>`;
        html += `<li><strong>ItemViewModel:</strong> Managing ${itemCount} items</li>`;
        html += `<li><strong>MainView:</strong> Handling all UI interactions</li>`;
        html += '</ul>';
        return html;
    }

    // === UTILITIES ===

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // === CLEANUP ===

    destroy() {
        // Remove event listeners to prevent memory leaks
        // This would be called when the view is destroyed
        console.log('MainView destroyed');
    }
}

// Export for use in the app
window.MainView = MainView;
