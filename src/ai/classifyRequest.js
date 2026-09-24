import { getDepartmentRegistry, resolveDepartment } from './departmentRegistry.js';

// AI layer entry point for guest requests (Requests Hub PRD, Step 4).
//
// `suggestDepartment` is the seam the LLM plugs into. It receives the guest's text plus
// the LIVE department list from the registry and must resolve to one of those names (or
// null). It is intentionally a stub for now — until it's implemented every request takes
// the fallback path, i.e. lands in the first department. Nothing else needs to change
// when it is: routeRequest already validates whatever comes back against the registry.
//
//   input:  { content: string, departments: string[], fallback: string }
//   output: { department: string, confidencePct?: number, reason?: string } | null
async function suggestDepartment(/* { content, departments, fallback } */) {
  return null; // TODO(ai-layer): call the LLM with `departments` as the only allowed labels
}

/**
 * Decide which department a new guest request is tagged to.
 * Never throws and never returns a department outside the registry.
 */
export async function routeRequest(propertyId, content) {
  const registry = await getDepartmentRegistry(propertyId);

  let suggestion = null;
  try {
    suggestion = await suggestDepartment({ content, departments: registry.departments, fallback: registry.fallback });
  } catch (error) {
    console.error('AI department suggestion failed, using fallback:', error);
  }

  const { department, matched } = resolveDepartment(registry, suggestion?.department);
  return {
    department,
    routing: matched
      ? {
          source: 'ai',
          confidencePct: Number.isFinite(suggestion.confidencePct) ? Math.round(suggestion.confidencePct) : null,
          reason: suggestion.reason || '',
        }
      : { source: 'fallback', confidencePct: null, reason: '' },
  };
}
