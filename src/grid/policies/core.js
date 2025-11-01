/**
 * @file policies/core.js
 * @description Core grid policy definitions and validators. Split for code-splitting.
 */

export const CORE_GRID_POLICY_DEFINITIONS = {
  "system.grid_performance_mode": {
    type: "boolean",
    default: null,
    domain: "system",
    description: "Force grid performance mode on/off (null = auto based on FPS)",
    category: "performance",
  },
  "system.grid_auto_save_layouts": {
    type: "boolean",
    default: true,
    domain: "system",
    description: "Automatically save grid layout changes",
    category: "persistence",
  },
  "system.grid_save_feedback": {
    type: "boolean",
    default: true,
    domain: "system",
    description: "Show toast notifications when layouts are saved",
    category: "user_experience",
  },
  "system.grid_ai_suggestions": {
    type: "boolean",
    default: false,
    domain: "system",
    description: "Enable AI-powered layout suggestions (future feature)",
    category: "ai_assistance",
  },

  // Grid defaults used by the renderer/system
  "grid.default_columns": {
    type: "number",
    default: 24,
    domain: "grid",
    description: "Default number of grid columns",
    category: "layout",
  },
  "grid.default_min_w": {
    type: "number",
    default: 1,
    domain: "grid",
    description: "Default minimum block width (columns)",
    category: "constraints",
  },
  "grid.default_min_h": {
    type: "number",
    default: 1,
    domain: "grid",
    description: "Default minimum block height (rows)",
    category: "constraints",
  },
  "grid.default_max_w": {
    type: "number",
    default: 24,
    domain: "grid",
    description: "Default maximum block width (columns)",
    category: "constraints",
  },
  "grid.default_max_h": {
    type: "number",
    default: 1000,
    domain: "grid",
    description: "Default maximum block height (rows)",
    category: "constraints",
  },
  "grid.allowed_component_types": {
    type: "array",
    default: [],
    domain: "grid",
    description: "Whitelist of allowed component types to render in grid blocks",
    category: "security",
  },

  // Expand/reflow configuration
  "grid.expand_enabled": {
    type: "boolean",
    default: true,
    domain: "grid",
    description: "Enable double-click expand on grid blocks",
    category: "interaction",
  },
  "grid.expand_mode": {
    type: "string",
    default: "reflow", // 'reflow' moves others; 'overlay' overlays
    domain: "grid",
    description: "Expand behavior: reflow or overlay",
    category: "interaction",
  },
  "grid.expand_target_rows": {
    type: "number",
    default: 8,
    domain: "grid",
    description: "Target height (rows) when expanded in reflow mode",
    category: "interaction",
  },
  "grid.expand_target_full_width": {
    type: "boolean",
    default: true,
    domain: "grid",
    description: "Expanded block should span full grid width in reflow mode",
    category: "interaction",
  },

  // Drag reflow configuration
  "grid.reflow_on_drag_enabled": {
    type: "boolean",
    default: false,
    domain: "grid",
    description: "When enabled, other blocks reflow on drop to avoid overlaps",
    category: "interaction",
  },
  "grid.reflow_strategy": {
    type: "string",
    default: "push_down", // strategies could expand later
    domain: "grid",
    description: "Reflow strategy to resolve overlaps after drag",
    category: "interaction",
  },
  "grid.reflow_live_preview": {
    type: "boolean",
    default: false,
    domain: "grid",
    description: "When enabled, reflow is previewed live during drag (DOM only)",
    category: "interaction",
  },

  // System-level extras referenced by CompleteGridSystem
  "system.grid_auto_save_layout_id": {
    type: "string",
    default: "default",
    domain: "system",
    description: "Identifier under which layouts are auto-saved",
    category: "persistence",
  },
  "system.grid_auto_save_layout_scope": {
    type: "string",
    default: "tenant",
    domain: "system",
    description: "Scope for auto-saved layouts (user/tenant/global)",
    category: "persistence",
  },
};

export const CORE_GRID_POLICY_VALIDATORS = {
  "system.grid_performance_mode": (value) => {
    if (value !== null && typeof value !== "boolean") {
      return { valid: false, message: "Grid performance mode must be null, true, or false" };
    }
    return { valid: true };
  },
  "system.grid_auto_save_layouts": (value) => ({ valid: typeof value === "boolean" }),
  "system.grid_save_feedback": (value) => ({ valid: typeof value === "boolean" }),
  "system.grid_ai_suggestions": (value) => ({ valid: typeof value === "boolean" }),

  "grid.default_columns": (value) => {
    const ok = Number.isInteger(value) && value > 0 && value <= 96;
    return ok ? { valid: true } : { valid: false, message: "default_columns must be 1..96" };
  },
  "grid.default_min_w": (value) => {
    const ok = Number.isInteger(value) && value > 0;
    return ok ? { valid: true } : { valid: false, message: "default_min_w must be >= 1" };
  },
  "grid.default_min_h": (value) => {
    const ok = Number.isInteger(value) && value > 0;
    return ok ? { valid: true } : { valid: false, message: "default_min_h must be >= 1" };
  },
  "grid.default_max_w": (value) => {
    const ok = Number.isInteger(value) && value >= 1;
    return ok ? { valid: true } : { valid: false, message: "default_max_w must be >= 1" };
  },
  "grid.default_max_h": (value) => {
    const ok = Number.isInteger(value) && value >= 1;
    return ok ? { valid: true } : { valid: false, message: "default_max_h must be >= 1" };
  },
  "grid.allowed_component_types": (value) => {
    if (!Array.isArray(value)) return { valid: false, message: "allowed_component_types must be array" };
    if (!value.every((v) => typeof v === 'string')) return { valid: false, message: "allowed_component_types items must be strings" };
    return { valid: true };
  },
  "grid.expand_enabled": (v) => ({ valid: typeof v === 'boolean' }),
  "grid.expand_mode": (v) => ({ valid: v === 'reflow' || v === 'overlay', message: 'expand_mode must be reflow or overlay' }),
  "grid.expand_target_rows": (v) => ({ valid: Number.isInteger(v) && v >= 1 && v <= 100, message: 'expand_target_rows must be 1..100' }),
  "grid.expand_target_full_width": (v) => ({ valid: typeof v === 'boolean' }),
  "grid.reflow_on_drag_enabled": (v) => ({ valid: typeof v === 'boolean' }),
  "grid.reflow_strategy": (v) => ({ valid: v === 'push_down', message: 'reflow_strategy must be push_down' }),
  "grid.reflow_live_preview": (v) => ({ valid: typeof v === 'boolean' }),
  "system.grid_auto_save_layout_id": (value) => {
    if (typeof value !== 'string' || !value.trim()) return { valid: false, message: "grid_auto_save_layout_id must be non-empty string" };
    return { valid: true };
  },
  "system.grid_auto_save_layout_scope": (value) => {
    const ok = value === 'user' || value === 'tenant' || value === 'global';
    return ok ? { valid: true } : { valid: false, message: "grid_auto_save_layout_scope must be one of user|tenant|global" };
  },
};
