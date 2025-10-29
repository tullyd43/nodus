// modules/compartment-security.js
// Compartment security module for need-to-know access control

/**
 * Compartment Security Module
 * Loaded for: NATO classifications, compartmentalized access
 * Bundle size: ~3KB (compartment management)
 */
export default class CompartmentSecurity {
  #compartmentRules = new Map();
  #accessMatrix = new Map();
  #inheritanceGraph = new Map();
  #auditLog = [];
  #context = null;

  constructor(options = {}) {
    this.options = {
      enableInheritance: options.enableInheritance !== false,
      strictMode: options.strictMode || false,
      auditAll: options.auditAll || false,
      ...options
    };

    console.log('[CompartmentSecurity] Loaded for compartment access control');
  }

  async init() {
    // Initialize standard compartment rules
    await this.#initializeStandardCompartments();
    
    console.log('[CompartmentSecurity] Compartment security initialized');
    return this;
  }

  /**
   * Set compartment access context
   */
  async setContext(userId, userCompartments, clearanceLevel) {
    this.#context = {
      userId,
      compartments: new Set(userCompartments),
      clearanceLevel,
      derivedCompartments: await this.#deriveAccessibleCompartments(userCompartments),
      timestamp: Date.now()
    };

    this.#audit('compartment_context_set', {
      userId,
      compartmentCount: userCompartments.length,
      derivedCount: this.#context.derivedCompartments.size
    });

    return this;
  }

  /**
   * Check if user can access specific compartments
   */
  async checkAccess(context, classification, requiredCompartments) {
    if (!this.#context) {
      this.#audit('access_denied_no_compartment_context', { requiredCompartments });
      return false;
    }

    // Check each required compartment
    for (const compartment of requiredCompartments) {
      if (!await this.#hasCompartmentAccess(compartment)) {
        this.#audit('compartment_access_denied', {
          compartment,
          userId: this.#context.userId,
          userCompartments: Array.from(this.#context.compartments)
        });
        return false;
      }
    }

    // Check compartment combinations (some combinations may be restricted)
    if (!this.#validateCompartmentCombination(requiredCompartments)) {
      this.#audit('compartment_combination_denied', {
        combination: requiredCompartments,
        userId: this.#context.userId
      });
      return false;
    }

    return true;
  }

  /**
   * Get all accessible compartments (including derived)
   */
  getAccessibleCompartments() {
    if (!this.#context) return new Set();
    
    return new Set([
      ...this.#context.compartments,
      ...this.#context.derivedCompartments
    ]);
  }

  /**
   * Check if user can access a specific compartment
   */
  async canAccessCompartment(compartment) {
    return await this.#hasCompartmentAccess(compartment);
  }

  /**
   * Add compartment inheritance rule
   */
  addInheritanceRule(parentCompartment, childCompartment) {
    if (!this.#inheritanceGraph.has(parentCompartment)) {
      this.#inheritanceGraph.set(parentCompartment, new Set());
    }
    
    this.#inheritanceGraph.get(parentCompartment).add(childCompartment);
    
    this.#audit('inheritance_rule_added', {
      parent: parentCompartment,
      child: childCompartment
    });
  }

  /**
   * Add compartment access rule
   */
  addAccessRule(compartment, rule) {
    this.#compartmentRules.set(compartment, {
      ...this.#compartmentRules.get(compartment),
      ...rule
    });
    
    this.#audit('access_rule_added', { compartment, rule });
  }

  /**
   * Get compartment audit log
   */
  getCompartmentAuditLog() {
    return this.#auditLog.slice();
  }

  /**
   * Clear compartment context
   */
  async clear() {
    this.#audit('compartment_context_cleared', {
      userId: this.#context?.userId
    });
    
    this.#context = null;
  }

  // Private methods
  async #hasCompartmentAccess(compartment) {
    if (!this.#context) return false;

    // Direct access
    if (this.#context.compartments.has(compartment)) {
      return true;
    }

    // Derived access through inheritance
    if (this.options.enableInheritance && this.#context.derivedCompartments.has(compartment)) {
      return true;
    }

    // Check compartment-specific rules
    const rules = this.#compartmentRules.get(compartment);
    if (rules) {
      return await this.#evaluateCompartmentRules(compartment, rules);
    }

    return false;
  }

  async #deriveAccessibleCompartments(userCompartments) {
    const derived = new Set();
    
    if (!this.options.enableInheritance) {
      return derived;
    }

    // BFS to find all inherited compartments
    const queue = [...userCompartments];
    const visited = new Set(userCompartments);

    while (queue.length > 0) {
      const current = queue.shift();
      const children = this.#inheritanceGraph.get(current);
      
      if (children) {
        for (const child of children) {
          if (!visited.has(child)) {
            visited.add(child);
            derived.add(child);
            queue.push(child);
          }
        }
      }
    }

    return derived;
  }

  #validateCompartmentCombination(compartments) {
    // Check for mutually exclusive compartments
    const exclusiveGroups = [
      ['HUMINT', 'SIGINT'], // Example: some intel types are exclusive
      ['NUCLEAR', 'CONVENTIONAL'] // Example: weapon type exclusivity
    ];

    for (const group of exclusiveGroups) {
      const presentInGroup = compartments.filter(c => group.includes(c));
      if (presentInGroup.length > 1) {
        return false; // Multiple exclusive compartments present
      }
    }

    // Check for required combinations
    const requiredCombinations = {
      'COSMIC': ['NATO', 'TOP_SECRET'], // COSMIC requires NATO and TOP_SECRET
      'ATOMAL': ['NATO', 'NUCLEAR'] // ATOMAL requires NATO and NUCLEAR
    };

    for (const compartment of compartments) {
      const required = requiredCombinations[compartment];
      if (required) {
        for (const req of required) {
          if (!compartments.includes(req)) {
            return false; // Required compartment missing
          }
        }
      }
    }

    return true;
  }

  async #evaluateCompartmentRules(compartment, rules) {
    // Evaluate time-based access
    if (rules.timeRestrictions) {
      const now = new Date();
      const currentHour = now.getHours();
      
      if (currentHour < rules.timeRestrictions.startHour || 
          currentHour > rules.timeRestrictions.endHour) {
        return false;
      }
    }

    // Evaluate clearance requirements
    if (rules.minimumClearance) {
      const clearanceLevels = [
        'restricted', 'confidential', 'secret', 'top_secret',
        'nato_restricted', 'nato_confidential', 'nato_secret', 'cosmic_top_secret'
      ];
      
      const userLevel = clearanceLevels.indexOf(this.#context.clearanceLevel);
      const requiredLevel = clearanceLevels.indexOf(rules.minimumClearance);
      
      if (userLevel < requiredLevel) {
        return false;
      }
    }

    // Evaluate special conditions
    if (rules.specialConditions) {
      for (const condition of rules.specialConditions) {
        if (!await this.#evaluateSpecialCondition(condition)) {
          return false;
        }
      }
    }

    return true;
  }

  async #evaluateSpecialCondition(condition) {
    switch (condition.type) {
      case 'dual_person_integrity':
        // Requires two-person authorization
        return condition.authorizedBy && condition.authorizedBy.length >= 2;
      
      case 'facility_requirement':
        // Requires access from specific facility
        return condition.allowedFacilities?.includes(this.#context.facility);
      
      case 'time_window':
        // Requires access within specific time window
        const now = Date.now();
        return now >= condition.startTime && now <= condition.endTime;
      
      default:
        console.warn(`[CompartmentSecurity] Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  async #initializeStandardCompartments() {
    // NATO standard compartments
    this.addInheritanceRule('NATO', 'NATO_RESTRICTED');
    this.addInheritanceRule('NATO', 'NATO_CONFIDENTIAL');
    this.addInheritanceRule('NATO', 'NATO_SECRET');
    this.addInheritanceRule('NATO_SECRET', 'COSMIC');
    
    // Intelligence compartments
    this.addInheritanceRule('INTELLIGENCE', 'HUMINT');
    this.addInheritanceRule('INTELLIGENCE', 'SIGINT');
    this.addInheritanceRule('INTELLIGENCE', 'GEOINT');
    
    // Nuclear compartments
    this.addAccessRule('NUCLEAR', {
      minimumClearance: 'secret',
      timeRestrictions: { startHour: 6, endHour: 18 },
      specialConditions: [
        { type: 'dual_person_integrity', required: true }
      ]
    });
    
    // COSMIC compartment (highest NATO level)
    this.addAccessRule('COSMIC', {
      minimumClearance: 'cosmic_top_secret',
      specialConditions: [
        { type: 'facility_requirement', allowedFacilities: ['SECURE_FACILITY_A', 'NATO_HQ'] },
        { type: 'dual_person_integrity', required: true }
      ]
    });
  }

  #audit(eventType, data) {
    const auditEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
      userId: this.#context?.userId,
      compartmentModule: true
    };

    this.#auditLog.push(auditEvent);

    // Log compartment violations
    if (eventType.includes('denied')) {
      console.warn(`[Compartment Security] ${eventType}:`, data);
    }

    // Keep audit log manageable
    if (this.#auditLog.length > 2000) {
      this.#auditLog = this.#auditLog.slice(-1000);
    }
  }

  get name() {
    return 'CompartmentSecurity';
  }
}
