/**
 * @file RenderContext_PolicyHelpers.js
 * @description Provides helper functions for evaluating policies within a rendering or application context.
 * This module integrates with the security system to check access based on policy names or classification levels.
 */

/**
 * Evaluates a given policy against the current user's security context.
 * This function typically checks if the user has access to a specific classification level or a named policy.
 * @param {string} policy - The policy to evaluate, which can be a security classification level (e.g., 'secret') or a named policy.
 * @param {object} context - The context object, which may contain user compartments.
 * @param {string[]} [context.compartments] - An array of security compartments relevant to the access check.
 * @param {import('./HybridStateManager.js').HybridStateManager} stateManager - The application's HybridStateManager instance.
 * @returns {boolean} `true` if the policy allows access, `false` otherwise.
 */
export function evaluatePolicy(policy, context, stateManager) {
  const security = stateManager?.storage?.instance?.security || null;
  // policy may be a classification or a named policy
  try {
    return security?.canAccess?.(policy, context?.compartments || []) ?? false;
  } catch {
    return false;
  }
}