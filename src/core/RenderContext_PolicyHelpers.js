export function evaluatePolicy(policy, context, stateManager) {
  const security = stateManager?.storage?.instance?.security || null;
  // policy may be a classification or a named policy
  try {
    return security?.canAccess?.(policy, context?.compartments || []) ?? false;
  } catch {
    return false;
  }
}