// ui/blocks/PolicyControlBlock.js
// Enhanced with permission/domain restriction tooltips

import { OptimizationAccessControl } from "../../core/OptimizationAccessControl.js";
import { SystemPolicies } from "../../core/SystemPolicies.js";

/**
 * Enhanced Policy Control BuildingBlock with detailed permission feedback
 */
export function PolicyControlBlock({ context, config = {} }) {
  const container = document.createElement("div");
  container.className = "policy-control-block";

  // Apply theme-aware styling
  const theme = context.getThemeVariables();
  container.style.cssText = `
    padding: ${config.padding || "1rem"};
    border-radius: ${config.borderRadius || "8px"};
    background: ${config.background || theme["--surface"]};
    color: ${config.color || theme["--text"]};
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    border: 1px solid ${theme["--border"]};
    min-width: ${config.minWidth || "300px"};
    position: relative;
  `;

  // Get current user session and permissions
  const session = OptimizationAccessControl.currentSession || {};
  const userRole = session.role || context.userRole || "guest";
  const allowedDomains =
    OptimizationAccessControl.getAllowedDomainsForRole(userRole);
  const canEditGlobal =
    OptimizationAccessControl.checkSessionPermission("manage_policies");

  // Create header
  const header = createHeader();
  container.appendChild(header);

  // Create permission status with enhanced feedback
  const permissionStatus = createPermissionStatus();
  container.appendChild(permissionStatus);

  // Create policy sections
  const policies = context.policies || {};
  const policyContainer = createPolicyContainer(policies);
  container.appendChild(policyContainer);

  // Create action buttons
  if (canEditGlobal) {
    const actions = createActionButtons();
    container.appendChild(actions);
  }

  /**
   * Create header section
   */
  function createHeader() {
    const headerDiv = document.createElement("div");
    headerDiv.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    `;

    const title = document.createElement("h3");
    title.textContent = config.title || "System Policy Control";
    title.style.cssText = `
      margin: 0;
      color: ${theme["--text"]};
      font-size: 1.1rem;
      font-weight: 600;
    `;

    const roleIndicator = document.createElement("span");
    roleIndicator.textContent = userRole.toUpperCase();
    roleIndicator.style.cssText = `
      padding: 0.25rem 0.5rem;
      background: ${getRoleColor(userRole)};
      color: white;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: bold;
      text-transform: uppercase;
      cursor: help;
    `;

    // Add tooltip to role indicator
    addTooltip(roleIndicator, getRoleDescription(userRole));

    headerDiv.appendChild(title);
    headerDiv.appendChild(roleIndicator);
    return headerDiv;
  }

  /**
   * Create enhanced permission status section
   */
  function createPermissionStatus() {
    const statusDiv = document.createElement("div");
    statusDiv.style.cssText = `
      padding: 0.5rem;
      background: ${theme["--surface-elevated"]};
      border-radius: 4px;
      border: 1px solid ${theme["--border"]};
      font-size: 0.85rem;
    `;

    const accessLevel = canEditGlobal ? "Full Control" : "Read Only";
    const accessColor = canEditGlobal ? theme["--success"] : theme["--warning"];
    const domainList =
      allowedDomains.length > 0 ? allowedDomains.join(", ") : "None";

    const accessInfo = document.createElement("div");
    accessInfo.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
        <strong>Access Level:</strong> 
        <span style="color: ${accessColor}; font-weight: bold;">${accessLevel}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>Allowed Domains:</strong> 
        <span style="color: ${theme["--text-muted"]};">${domainList}</span>
      </div>
    `;
    accessInfo.style.color = theme["--text-muted"];

    // Add help text for restricted access
    if (!canEditGlobal || allowedDomains.length < 5) {
      const helpText = document.createElement("div");
      helpText.style.cssText = `
        margin-top: 0.5rem;
        padding: 0.25rem;
        background: ${theme["--warning"]}20;
        border-left: 3px solid ${theme["--warning"]};
        font-size: 0.8rem;
        color: ${theme["--text-muted"]};
      `;

      let helpMessage = "";
      if (!canEditGlobal) {
        helpMessage =
          "💡 You have read-only access. Contact an administrator to modify policies.";
      } else if (allowedDomains.length < 5) {
        helpMessage = `💡 You can only modify policies in: ${domainList}`;
      }

      helpText.textContent = helpMessage;
      statusDiv.appendChild(accessInfo);
      statusDiv.appendChild(helpText);
    } else {
      statusDiv.appendChild(accessInfo);
    }

    return statusDiv;
  }

  /**
   * Create policy container with sections and enhanced tooltips
   */
  function createPolicyContainer(policies) {
    const policyDiv = document.createElement("div");
    policyDiv.className = "policy-sections";
    policyDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-height: ${config.maxHeight || "400px"};
      overflow-y: auto;
    `;

    // Define policy sections with their display names and descriptions
    const sections = {
      system: {
        name: "System Policies",
        icon: "⚙️",
        description: "Core system behavior and optimization settings",
      },
      ui: {
        name: "UI Policies",
        icon: "🎨",
        description: "User interface behavior and appearance settings",
      },
      events: {
        name: "Event Policies",
        icon: "⚡",
        description: "Event processing and flow management settings",
      },
      user: {
        name: "User Policies",
        icon: "👤",
        description: "User data and privacy management settings",
      },
      meta: {
        name: "Meta Policies",
        icon: "📊",
        description: "Analytics, monitoring, and system metadata settings",
      },
    };

    // Create each policy section
    Object.entries(sections).forEach(([sectionKey, sectionInfo]) => {
      const sectionPolicies = policies[sectionKey] || {};
      const sectionElement = createPolicySection(
        sectionKey,
        sectionInfo,
        sectionPolicies,
      );
      policyDiv.appendChild(sectionElement);
    });

    return policyDiv;
  }

  /**
   * Create individual policy section with enhanced access feedback
   */
  function createPolicySection(sectionKey, sectionInfo, sectionPolicies) {
    const sectionDiv = document.createElement("div");
    sectionDiv.className = `policy-section-${sectionKey}`;

    const isDomainAllowed = allowedDomains.includes(sectionKey.toLowerCase());
    const canEditSection = canEditGlobal && isDomainAllowed;

    // Calculate restriction reason
    let restrictionReason = "";
    if (!canEditGlobal) {
      restrictionReason = "Insufficient permissions to manage policies";
    } else if (!isDomainAllowed) {
      restrictionReason = `Role "${userRole}" cannot access "${sectionKey}" domain`;
    }

    sectionDiv.style.cssText = `
      border: 1px solid ${theme["--border"]};
      border-radius: 6px;
      overflow: hidden;
      background: ${theme["--surface-elevated"]};
      opacity: ${canEditSection ? "1" : "0.7"};
      transition: opacity 0.2s ease;
    `;

    // Section header with tooltip
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 0.75rem;
      background: ${theme["--surface"]};
      border-bottom: 1px solid ${theme["--border"]};
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: ${restrictionReason ? "help" : "default"};
    `;

    const headerTitle = document.createElement("div");
    headerTitle.innerHTML = `${sectionInfo.icon} <strong>${sectionInfo.name}</strong>`;
    headerTitle.style.cssText = `
      font-size: 0.9rem;
      color: ${theme["--text"]};
    `;

    const accessBadge = document.createElement("span");
    accessBadge.textContent = canEditSection ? "Edit" : "Read Only";
    accessBadge.style.cssText = `
      padding: 0.25rem 0.5rem;
      background: ${canEditSection ? theme["--success"] : theme["--warning"]};
      color: white;
      border-radius: 3px;
      font-size: 0.7rem;
      font-weight: bold;
      cursor: help;
    `;

    // Add tooltips for restrictions
    if (restrictionReason) {
      addTooltip(header, restrictionReason);
      addTooltip(accessBadge, restrictionReason);
    } else {
      addTooltip(headerTitle, sectionInfo.description);
      addTooltip(accessBadge, "You can modify policies in this domain");
    }

    header.appendChild(headerTitle);
    header.appendChild(accessBadge);
    sectionDiv.appendChild(header);

    // Section content
    const content = document.createElement("div");
    content.style.cssText = `
      padding: 0.75rem;
    `;

    if (!isDomainAllowed && !canEditGlobal) {
      // Enhanced no access message with explanation
      const noAccess = document.createElement("div");
      noAccess.style.cssText = `
        text-align: center;
        padding: 1rem;
        background: ${theme["--warning"]}10;
        border-radius: 4px;
        border: 1px dashed ${theme["--warning"]};
      `;

      const icon = document.createElement("div");
      icon.textContent = "🔒";
      icon.style.cssText = `
        font-size: 2rem;
        margin-bottom: 0.5rem;
      `;

      const message = document.createElement("div");
      message.textContent = "Access Restricted";
      message.style.cssText = `
        font-weight: bold;
        color: ${theme["--text"]};
        margin-bottom: 0.25rem;
      `;

      const reason = document.createElement("div");
      reason.textContent = restrictionReason;
      reason.style.cssText = `
        color: ${theme["--text-muted"]};
        font-size: 0.85rem;
        font-style: italic;
      `;

      noAccess.appendChild(icon);
      noAccess.appendChild(message);
      noAccess.appendChild(reason);
      content.appendChild(noAccess);
    } else {
      // Policy toggles
      if (Object.keys(sectionPolicies).length === 0) {
        const noPolicies = document.createElement("div");
        noPolicies.textContent = "No policies configured for this domain";
        noPolicies.style.cssText = `
          color: ${theme["--text-muted"]};
          font-style: italic;
          text-align: center;
          padding: 1rem;
          background: ${theme["--surface"]};
          border-radius: 4px;
          border: 1px dashed ${theme["--border"]};
        `;
        content.appendChild(noPolicies);
      } else {
        Object.entries(sectionPolicies).forEach(([policyKey, policyValue]) => {
          const toggle = createPolicyToggle(
            sectionKey,
            policyKey,
            policyValue,
            canEditSection,
            restrictionReason,
          );
          content.appendChild(toggle);
        });
      }
    }

    sectionDiv.appendChild(content);
    return sectionDiv;
  }

  /**
   * Create individual policy toggle with enhanced tooltips
   */
  function createPolicyToggle(
    section,
    key,
    value,
    editable,
    restrictionReason,
  ) {
    const row = document.createElement("label");
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0;
      border-bottom: 1px solid ${theme["--border"]};
      cursor: ${editable ? "pointer" : "help"};
      font-size: 0.85rem;
      transition: background-color 0.2s ease;
    `;

    if (!editable) {
      row.style.opacity = "0.6";
    }

    // Add hover effect for interactive rows
    if (editable) {
      row.addEventListener("mouseenter", () => {
        row.style.backgroundColor = theme["--surface-elevated"];
      });
      row.addEventListener("mouseleave", () => {
        row.style.backgroundColor = "transparent";
      });
    }

    // Policy name and description
    const nameDiv = document.createElement("div");
    nameDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex: 1;
    `;

    const name = document.createElement("span");
    name.textContent = formatPolicyName(key);
    name.style.cssText = `
      font-weight: 500;
      color: ${theme["--text"]};
    `;

    const description = document.createElement("small");
    description.textContent = getPolicyDescription(key);
    description.style.cssText = `
      color: ${theme["--text-muted"]};
      font-size: 0.75rem;
      line-height: 1.3;
    `;

    nameDiv.appendChild(name);
    nameDiv.appendChild(description);

    // Toggle switch container
    const toggleContainer = document.createElement("div");
    toggleContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 0.5rem;
      position: relative;
    `;

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = !!value;
    toggle.disabled = !editable;
    toggle.style.cssText = `
      width: 18px;
      height: 18px;
      cursor: ${editable ? "pointer" : "not-allowed"};
    `;

    const statusText = document.createElement("span");
    statusText.textContent = value ? "ON" : "OFF";
    statusText.style.cssText = `
      font-size: 0.75rem;
      font-weight: bold;
      color: ${value ? theme["--success"] : theme["--error"]};
      min-width: 25px;
    `;

    // Add restriction icon for disabled toggles
    if (!editable) {
      const restrictionIcon = document.createElement("span");
      restrictionIcon.textContent = "🔒";
      restrictionIcon.style.cssText = `
        font-size: 0.8rem;
        opacity: 0.7;
        cursor: help;
      `;

      addTooltip(
        restrictionIcon,
        restrictionReason || "Policy cannot be modified",
      );
      toggleContainer.appendChild(restrictionIcon);
    }

    // Add dependency info if policy has dependencies
    const dependencies = SystemPolicies.getPolicyDependencies(section, key);
    if (dependencies.length > 0) {
      const depIcon = document.createElement("span");
      depIcon.textContent = "🔗";
      depIcon.style.cssText = `
        font-size: 0.8rem;
        opacity: 0.7;
        cursor: help;
        margin-left: 0.25rem;
      `;

      const depText = `Depends on: ${dependencies.map((dep) => formatPolicyName(dep.split(".")[1])).join(", ")}`;
      addTooltip(depIcon, depText);
      toggleContainer.appendChild(depIcon);
    }

    if (editable) {
      toggle.addEventListener("change", async () => {
        await handlePolicyToggle(section, key, toggle.checked);
        statusText.textContent = toggle.checked ? "ON" : "OFF";
        statusText.style.color = toggle.checked
          ? theme["--success"]
          : theme["--error"];
      });
    } else {
      // Add tooltip explaining why toggle is disabled
      addTooltip(
        toggle,
        restrictionReason || "You do not have permission to modify this policy",
      );
    }

    toggleContainer.appendChild(toggle);
    toggleContainer.appendChild(statusText);

    row.appendChild(nameDiv);
    row.appendChild(toggleContainer);

    return row;
  }

  /**
   * Add tooltip to element
   */
  function addTooltip(element, text) {
    if (!text) return;

    element.addEventListener("mouseenter", (e) => {
      const tooltip = createTooltip(text);
      document.body.appendChild(tooltip);

      const rect = element.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;

      // Adjust if tooltip goes off screen
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.left < 10) {
        tooltip.style.left = "10px";
      }
      if (tooltipRect.right > window.innerWidth - 10) {
        tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
      }

      element._tooltip = tooltip;
    });

    element.addEventListener("mouseleave", () => {
      if (element._tooltip) {
        element._tooltip.remove();
        element._tooltip = null;
      }
    });
  }

  /**
   * Create tooltip element
   */
  function createTooltip(text) {
    const tooltip = document.createElement("div");
    tooltip.textContent = text;
    tooltip.style.cssText = `
      position: absolute;
      background: ${theme["--surface-elevated"]};
      color: ${theme["--text"]};
      padding: 0.5rem;
      border-radius: 4px;
      border: 1px solid ${theme["--border"]};
      font-size: 0.8rem;
      max-width: 200px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      pointer-events: none;
      transform: translateX(-50%);
    `;

    // Add arrow
    const arrow = document.createElement("div");
    arrow.style.cssText = `
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 5px solid ${theme["--border"]};
    `;
    tooltip.appendChild(arrow);

    return tooltip;
  }

  /**
   * Create action buttons
   */
  function createActionButtons() {
    const actionsDiv = document.createElement("div");
    actionsDiv.style.cssText = `
      display: flex;
      gap: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid ${theme["--border"]};
      margin-top: 0.5rem;
    `;

    // Refresh button
    const refreshBtn = createButton(
      "Refresh",
      "🔄",
      () => {
        window.location.reload();
      },
      "Reload the page to refresh policy states",
    );

    // Export button
    const exportBtn = createButton(
      "Export",
      "📤",
      () => {
        exportPolicies();
      },
      "Export current policy configuration as JSON",
    );

    // Import button (if super admin)
    if (userRole === "super_admin") {
      const importBtn = createButton(
        "Import",
        "📥",
        () => {
          importPolicies();
        },
        "Import policy configuration from JSON file",
      );
      actionsDiv.appendChild(importBtn);
    }

    actionsDiv.appendChild(refreshBtn);
    actionsDiv.appendChild(exportBtn);

    return actionsDiv;
  }

  /**
   * Create action button with tooltip
   */
  function createButton(text, icon, onClick, tooltipText) {
    const button = document.createElement("button");
    button.innerHTML = `${icon} ${text}`;
    button.style.cssText = `
      padding: 0.5rem 1rem;
      background: ${theme["--primary"]};
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      transition: background 0.2s;
    `;

    button.addEventListener("click", onClick);
    button.addEventListener("mouseenter", () => {
      button.style.background = theme["--primary-dark"] || theme["--primary"];
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = theme["--primary"];
    });

    if (tooltipText) {
      addTooltip(button, tooltipText);
    }

    return button;
  }

  /**
   * Handle policy toggle with enhanced error handling
   */
  async function handlePolicyToggle(section, key, enabled) {
    try {
      // Check dependencies before enabling
      if (enabled) {
        const dependencies = SystemPolicies.getPolicyDependencies(section, key);
        for (const dep of dependencies) {
          const [depDomain, depKey] = dep.split(".");
          const depValue = context.getPolicy(depDomain, depKey);
          if (!depValue) {
            throw new Error(
              `Cannot enable ${key}: dependency ${dep} is not enabled`,
            );
          }
        }
      }

      // Update local context
      if (!context.policies[section]) {
        context.policies[section] = {};
      }
      context.policies[section][key] = enabled;

      // Update system policies
      await SystemPolicies.update(section, key, enabled);

      // Emit event
      if (context.eventFlow) {
        context.eventFlow.emit("policy_updated", {
          section,
          key,
          enabled,
          role: userRole,
          timestamp: new Date().toISOString(),
        });
      }

      // Audit log
      OptimizationAccessControl.auditUserAction(
        userRole,
        `policy_update:${section}.${key}`,
        { enabled, domain: section },
      );

      console.log(`Policy updated: ${section}.${key} = ${enabled}`);
    } catch (error) {
      console.error(`Failed to update policy ${section}.${key}:`, error);

      // Revert UI state on error
      const toggle = container.querySelector(
        `input[data-policy="${section}.${key}"]`,
      );
      if (toggle) {
        toggle.checked = !enabled;
      }

      // Show error notification
      if (context.eventFlow) {
        context.eventFlow.emit("error", {
          message: `Failed to update policy: ${error.message}`,
          level: "medium",
          context: { section, key, enabled },
        });
      }
    }
  }

  // ... rest of helper functions (exportPolicies, importPolicies, etc.) remain the same ...

  /**
   * Get role color for display
   */
  function getRoleColor(role) {
    const colors = {
      super_admin: "#dc3545",
      db_admin: "#fd7e14",
      developer: "#20c997",
      analyst: "#6f42c1",
      monitor: "#6c757d",
      guest: "#adb5bd",
    };
    return colors[role] || colors.guest;
  }

  /**
   * Get role description for tooltip
   */
  function getRoleDescription(role) {
    const descriptions = {
      super_admin: "Full system access across all domains and operations",
      db_admin: "Database and system optimization access (system, ui, events)",
      developer: "Development and UI component access (ui, events)",
      analyst: "Analytics and reporting access (user, meta)",
      monitor: "Read-only monitoring access (meta)",
      guest: "No access - read-only guest user",
    };
    return descriptions[role] || "Unknown role";
  }

  /**
   * Format policy name for display
   */
  function formatPolicyName(key) {
    return key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Get policy description
   */
  function getPolicyDescription(key) {
    const descriptions = {
      enable_analytics: "Track user interactions and system usage patterns",
      enable_auditing: "Log all system changes and access attempts",
      enable_ai_assistance: "Use AI for suggestions and automation",
      enable_optimization: "Automatic performance optimizations",
      enable_caching: "Cache frequently accessed data",
      enable_lazy_loading: "Load components on demand",
      enable_monitoring: "Real-time system monitoring",
      enable_notifications: "System and user notifications",
      enable_debug_mode: "Enhanced debugging information",
      enable_maintenance_mode: "System maintenance operations",
      enable_animations: "UI animations and transitions",
      enable_tooltips: "Help tooltips and hints",
      dark_mode_default: "Default to dark theme",
      responsive_design: "Responsive layout behavior",
      accessibility_mode: "Enhanced accessibility features",
      enable_event_flows: "Event processing and flows",
      enable_event_logging: "Log all system events",
      enable_async_processing: "Asynchronous event processing",
      enable_user_analytics: "Track user behavior",
      enable_preference_sync: "Sync user preferences",
      privacy_mode: "Enhanced privacy protection",
      enable_performance_tracking: "Track system performance",
      enable_error_reporting: "Report errors to monitoring",
      enable_health_checks: "System health monitoring",
    };

    return descriptions[key] || "Policy configuration option";
  }

  // Export policies and import policies functions remain the same...
  function exportPolicies() {
    const export_data = {
      timestamp: new Date().toISOString(),
      exportedBy: userRole,
      policies: context.policies,
      metadata: {
        version: "1.0",
        domains: allowedDomains,
      },
    };

    const blob = new Blob([JSON.stringify(export_data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `policies-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importPolicies() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const imported = JSON.parse(e.target.result);
            console.log("Imported policies:", imported);
            // Implementation would update policies here
          } catch (error) {
            console.error("Invalid policy file:", error);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  return container;
}

// Register and factory functions remain the same...
export function registerPolicyControlBlock(renderer) {
  renderer.registerBlock("policy_control", {
    render: PolicyControlBlock,
    config: {
      title: "System Policy Control",
      padding: "1rem",
      minWidth: "300px",
      maxHeight: "500px",
    },
    dependencies: ["policies", "eventFlow"],
  });
}

export function createPolicyControl(config = {}) {
  return {
    type: "policy_control",
    config: {
      title: "Policy Management",
      ...config,
    },
  };
}

export default PolicyControlBlock;
