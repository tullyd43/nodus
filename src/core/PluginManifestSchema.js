// schemas/PluginManifestSchema.js
// Complete plugin manifest schema definition for declarative plugin system

export const PluginManifestSchema = {
  // Core plugin metadata
  id: {
    type: 'string',
    required: true,
    description: 'Unique plugin identifier',
    pattern: '^[a-z0-9-_]+$',
    examples: ['fitness-tracker', 'analytics-dashboard']
  },
  
  name: {
    type: 'string',
    required: true,
    description: 'Human-readable plugin name',
    maxLength: 100,
    examples: ['Fitness Tracker', 'Analytics Dashboard']
  },
  
  version: {
    type: 'string',
    required: true,
    description: 'Plugin version (semantic versioning)',
    pattern: '^\\d+\\.\\d+\\.\\d+(-[a-z0-9-]+)?$',
    examples: ['1.0.0', '2.1.3-beta']
  },
  
  description: {
    type: 'string',
    description: 'Plugin description',
    maxLength: 500
  },
  
  author: {
    type: 'object',
    properties: {
      name: { type: 'string', required: true },
      email: { type: 'string', format: 'email' },
      url: { type: 'string', format: 'url' }
    }
  },
  
  // Plugin configuration
  enabled: {
    type: 'boolean',
    default: true,
    description: 'Whether plugin is enabled'
  },
  
  autoload: {
    type: 'boolean',
    default: true,
    description: 'Whether to load plugin automatically on startup'
  },
  
  priority: {
    type: 'string',
    enum: ['low', 'normal', 'high'],
    default: 'normal',
    description: 'Plugin loading priority'
  },
  
  // Plugin components
  components: {
    type: 'object',
    properties: {
      widgets: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              required: true,
              description: 'Widget identifier'
            },
            name: {
              type: 'string',
              required: true,
              description: 'Widget display name'
            },
            description: {
              type: 'string',
              description: 'Widget description'
            },
            entity_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Entity types this widget can display'
            },
            adaptations: {
              type: 'object',
              description: 'Adaptive rendering configurations',
              properties: {
                minimal: {
                  type: 'object',
                  properties: {
                    trigger: { type: 'object' },
                    render: { type: 'object' }
                  }
                },
                standard: {
                  type: 'object',
                  properties: {
                    trigger: { type: 'object' },
                    render: { type: 'object' }
                  }
                },
                detailed: {
                  type: 'object',
                  properties: {
                    trigger: { type: 'object' },
                    render: { type: 'object' }
                  }
                }
              }
            },
            config_schema: {
              type: 'object',
              description: 'Configuration schema for widget'
            },
            default_config: {
              type: 'object',
              description: 'Default configuration values'
            }
          }
        }
      },
      
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              required: true,
              description: 'Action identifier'
            },
            name: {
              type: 'string',
              required: true,
              description: 'Action display name'
            },
            description: {
              type: 'string',
              description: 'Action description'
            },
            entity_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Entity types this action applies to'
            },
            category: {
              type: 'string',
              enum: ['essential', 'common', 'advanced'],
              default: 'common',
              description: 'Action category for adaptive display'
            },
            visibility: {
              type: 'object',
              properties: {
                conditions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Visibility conditions (JavaScript expressions)'
                },
                permissions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Required permissions'
                },
                contexts: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'UI contexts where action is visible'
                }
              }
            },
            target: {
              type: 'string',
              enum: ['self', 'related', 'selected', 'new', 'external'],
              default: 'self',
              description: 'Action target type'
            },
            confirmation: {
              type: 'object',
              properties: {
                required: { type: 'boolean', default: false },
                message: { type: 'string' },
                level: { 
                  type: 'string', 
                  enum: ['info', 'warning', 'danger'],
                  default: 'info'
                }
              }
            }
          }
        }
      },
      
      field_renderers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            entity_type: {
              type: 'string',
              required: true,
              description: 'Entity type (* for all types)'
            },
            field: {
              type: 'string',
              required: true,
              description: 'Field name or pattern'
            },
            field_type: {
              type: 'string',
              description: 'Field data type'
            },
            adaptations: {
              type: 'object',
              description: 'Rendering adaptations by context',
              properties: {
                minimal: { type: 'object' },
                standard: { type: 'object' },
                detailed: { type: 'object' }
              }
            },
            priority: {
              type: 'number',
              default: 0,
              description: 'Renderer priority (higher = preferred)'
            }
          }
        }
      },
      
      command_handlers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              required: true,
              description: 'Command type to handle'
            },
            priority: {
              type: 'number',
              default: 0,
              description: 'Handler priority'
            },
            async: {
              type: 'boolean',
              default: false,
              description: 'Whether handler is asynchronous'
            }
          }
        }
      },
      
      event_flows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              required: true,
              description: 'Flow identifier'
            },
            name: {
              type: 'string',
              required: true,
              description: 'Flow name'
            },
            trigger: {
              type: 'object',
              required: true,
              properties: {
                events: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Events that trigger this flow'
                }
              }
            },
            conditions: {
              type: 'object',
              description: 'Condition definitions'
            },
            actions: {
              type: 'object',
              description: 'Actions to execute per condition'
            }
          }
        }
      }
    }
  },
  
  // Dependencies
  dependencies: {
    type: 'object',
    properties: {
      plugins: {
        type: 'array',
        items: { type: 'string' },
        description: 'Required plugin dependencies'
      },
      frontend: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
            version: { type: 'string' },
            cdn_url: { type: 'string', format: 'url' }
          }
        },
        description: 'Frontend library dependencies'
      },
      backend: {
        type: 'array',
        items: { type: 'string' },
        description: 'Backend service dependencies'
      },
      api_version: {
        type: 'string',
        description: 'Required platform API version'
      }
    }
  },
  
  // Runtime configuration
  runtime: {
    type: 'object',
    oneOf: [
      {
        // External runtime
        properties: {
          frontend: {
            type: 'string',
            format: 'url',
            description: 'Frontend runtime URL'
          },
          backend: {
            type: 'string',
            format: 'url',
            description: 'Backend service URL'
          }
        }
      },
      {
        // Inline runtime
        properties: {
          inline: {
            type: 'object',
            description: 'Inline component definitions'
          }
        }
      }
    ]
  },
  
  // Security configuration
  permissions: {
    type: 'array',
    items: { type: 'string' },
    description: 'Permissions required by plugin'
  },
  
  sandbox: {
    type: 'boolean',
    default: true,
    description: 'Whether to run plugin in sandbox'
  },
  
  content_security_policy: {
    type: 'object',
    properties: {
      script_src: { type: 'array', items: { type: 'string' } },
      style_src: { type: 'array', items: { type: 'string' } },
      connect_src: { type: 'array', items: { type: 'string' } }
    }
  },
  
  // Configuration schema
  config: {
    type: 'object',
    description: 'Plugin configuration values'
  },
  
  config_schema: {
    type: 'object',
    description: 'Schema for plugin configuration'
  },
  
  // Marketplace metadata
  marketplace: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: [
          'productivity', 'analytics', 'communication', 'integration',
          'visualization', 'automation', 'security', 'development'
        ],
        description: 'Marketplace category'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plugin tags for discovery'
      },
      screenshots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'url' },
            caption: { type: 'string' }
          }
        }
      },
      demo_url: {
        type: 'string',
        format: 'url',
        description: 'Demo or documentation URL'
      },
      pricing: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            enum: ['free', 'freemium', 'paid', 'subscription']
          },
          price: { type: 'number' },
          currency: { type: 'string' },
          billing_period: {
            type: 'string',
            enum: ['one-time', 'monthly', 'yearly']
          }
        }
      }
    }
  },
  
  // Lifecycle hooks
  lifecycle: {
    type: 'object',
    properties: {
      install: {
        type: 'object',
        properties: {
          scripts: { type: 'array', items: { type: 'string' } },
          migrations: { type: 'array', items: { type: 'object' } }
        }
      },
      update: {
        type: 'object',
        properties: {
          scripts: { type: 'array', items: { type: 'string' } },
          migrations: { type: 'array', items: { type: 'object' } }
        }
      },
      uninstall: {
        type: 'object',
        properties: {
          cleanup_scripts: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

/**
 * Example plugin manifests for reference
 */
export const ExampleManifests = {
  // Simple widget plugin
  simpleWidget: {
    id: 'simple-clock',
    name: 'Simple Clock Widget',
    version: '1.0.0',
    description: 'A simple clock widget for dashboards',
    author: { name: 'Nodus Team' },
    
    components: {
      widgets: [{
        id: 'clock_widget',
        name: 'Clock',
        description: 'Digital clock display',
        entity_types: ['*'],
        adaptations: {
          minimal: {
            trigger: { containerWidth: { max: 200 } },
            render: { format: 'HH:MM' }
          },
          standard: {
            trigger: { containerWidth: { min: 200, max: 400 } },
            render: { format: 'HH:MM:SS', showDate: false }
          },
          detailed: {
            trigger: { containerWidth: { min: 400 } },
            render: { format: 'full', showDate: true, showTimezone: true }
          }
        }
      }]
    },
    
    runtime: {
      inline: {
        components: {
          clock_widget: {
            render: (context) => {
              const div = document.createElement('div');
              div.className = 'clock-widget';
              const now = new Date();
              
              const formatTime = (format) => {
                switch (format) {
                  case 'HH:MM':
                    return now.toTimeString().slice(0, 5);
                  case 'HH:MM:SS':
                    return now.toTimeString().slice(0, 8);
                  case 'full':
                  default:
                    return now.toLocaleString();
                }
              };
              
              div.innerHTML = `
                <div class="time">${formatTime(context.config.format)}</div>
                ${context.config.showDate ? `<div class="date">${now.toDateString()}</div>` : ''}
                ${context.config.showTimezone ? `<div class="timezone">${Intl.DateTimeFormat().resolvedOptions().timeZone}</div>` : ''}
              `;
              
              // Update every second
              setInterval(() => {
                const now = new Date();
                div.querySelector('.time').textContent = formatTime(context.config.format);
                if (context.config.showDate) {
                  div.querySelector('.date').textContent = now.toDateString();
                }
              }, 1000);
              
              return div;
            }
          }
        }
      }
    },
    
    marketplace: {
      category: 'productivity',
      tags: ['clock', 'time', 'widget', 'dashboard'],
      pricing: { model: 'free' }
    }
  },
  
  // Complex integration plugin
  complexIntegration: {
    id: 'google-calendar-integration',
    name: 'Google Calendar Integration',
    version: '2.1.0',
    description: 'Integrate with Google Calendar for event management',
    author: { name: 'Integration Team', email: 'integrations@example.com' },
    
    dependencies: {
      plugins: ['authentication-manager'],
      frontend: [
        { name: 'google-apis', version: '^1.0.0', cdn_url: 'https://apis.google.com/js/api.js' }
      ],
      api_version: '6.0'
    },
    
    permissions: [
      'calendar.read',
      'calendar.write',
      'user.profile.read'
    ],
    
    components: {
      widgets: [{
        id: 'calendar_view',
        name: 'Calendar View',
        entity_types: ['event', 'calendar'],
        adaptations: {
          minimal: {
            trigger: { containerArea: { max: 40000 } },
            render: { view: 'agenda', events: 5 }
          },
          standard: {
            trigger: { containerArea: { min: 40000, max: 100000 } },
            render: { view: 'week', toolbar: true }
          },
          detailed: {
            trigger: { containerArea: { min: 100000 } },
            render: { view: 'month', toolbar: true, sidebar: true }
          }
        }
      }],
      
      actions: [{
        id: 'sync_google_calendar',
        name: 'Sync with Google Calendar',
        entity_types: ['calendar'],
        category: 'common',
        target: 'self',
        visibility: {
          permissions: ['calendar.write'],
          conditions: ['entity.type === "calendar"']
        }
      }],
      
      event_flows: [{
        id: 'calendar_sync_flow',
        name: 'Calendar Sync Flow',
        trigger: { events: ['calendar_updated', 'event_created'] },
        conditions: {
          sync_enabled: { 'entity.sync_enabled': true },
          has_permissions: { type: 'user_permission', permissions: ['calendar.write'] }
        },
        actions: {
          sync_enabled: [
            { type: 'sync_to_google', target: 'google_calendar' },
            { type: 'show_notification', message: 'Calendar synced successfully' }
          ]
        }
      }]
    },
    
    runtime: {
      frontend: 'https://cdn.example.com/plugins/google-calendar/v2.1.0/runtime.js'
    },
    
    config_schema: {
      google_client_id: { type: 'string', required: true },
      sync_interval: { type: 'number', default: 300000 },
      default_calendar: { type: 'string' }
    },
    
    marketplace: {
      category: 'integration',
      tags: ['google', 'calendar', 'sync', 'productivity'],
      pricing: { model: 'freemium' },
      demo_url: 'https://docs.example.com/plugins/google-calendar'
    }
  }
};

/**
 * Manifest validation function
 */
export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  
  // Check required fields
  if (!manifest.id) errors.push('Missing required field: id');
  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.version) errors.push('Missing required field: version');
  
  // Validate ID format
  if (manifest.id && !/^[a-z0-9-_]+$/.test(manifest.id)) {
    errors.push('ID must contain only lowercase letters, numbers, hyphens, and underscores');
  }
  
  // Validate version format
  if (manifest.version && !/^\d+\.\d+\.\d+(-[a-z0-9-]+)?$/.test(manifest.version)) {
    errors.push('Version must follow semantic versioning format (e.g., 1.0.0)');
  }
  
  // Check components
  if (manifest.components) {
    // Validate widgets
    if (manifest.components.widgets) {
      manifest.components.widgets.forEach((widget, index) => {
        if (!widget.id) errors.push(`Widget ${index}: missing id`);
        if (!widget.name) errors.push(`Widget ${index}: missing name`);
      });
    }
    
    // Validate actions
    if (manifest.components.actions) {
      manifest.components.actions.forEach((action, index) => {
        if (!action.id) errors.push(`Action ${index}: missing id`);
        if (!action.name) errors.push(`Action ${index}: missing name`);
        if (action.category && !['essential', 'common', 'advanced'].includes(action.category)) {
          warnings.push(`Action ${index}: invalid category '${action.category}'`);
        }
      });
    }
  }
  
  // Check runtime configuration
  if (!manifest.runtime) {
    warnings.push('No runtime configuration specified - plugin will use default runtime');
  } else if (!manifest.runtime.frontend && !manifest.runtime.inline) {
    warnings.push('Runtime configuration incomplete - specify either frontend URL or inline definition');
  }
  
  // Check dependencies
  if (manifest.dependencies?.plugins) {
    manifest.dependencies.plugins.forEach(pluginId => {
      if (!/^[a-z0-9-_]+$/.test(pluginId)) {
        warnings.push(`Invalid plugin dependency ID: ${pluginId}`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Create manifest from template
 */
export function createManifestTemplate(type = 'simple') {
  const templates = {
    simple: {
      id: '',
      name: '',
      version: '1.0.0',
      description: '',
      author: { name: '' },
      components: {
        widgets: []
      },
      runtime: {
        inline: {
          components: {}
        }
      }
    },
    
    complex: {
      id: '',
      name: '',
      version: '1.0.0',
      description: '',
      author: { name: '', email: '' },
      dependencies: {
        plugins: [],
        frontend: []
      },
      permissions: [],
      components: {
        widgets: [],
        actions: [],
        event_flows: []
      },
      runtime: {
        frontend: ''
      },
      config_schema: {},
      marketplace: {
        category: 'productivity',
        tags: []
      }
    }
  };
  
  return JSON.parse(JSON.stringify(templates[type] || templates.simple));
}

export default PluginManifestSchema;