/**
 * Permission matcher (Minecraft-style).
 *
 * Nodes:
 *   - `*`                     root wildcard, matches everything
 *   - `users.edit`            exact match only
 *   - `users.edit.*`          matches `users.edit.anything`, including deeper
 *   - `!users.edit.delete`    negation — removes a previously granted perm
 *   - `!users.*`              negate a whole subtree
 *
 * Matching algorithm:
 *   1. Split grant list into positives + negatives.
 *   2. If any negative matches the query → DENY.
 *   3. Else if any positive matches → ALLOW.
 *   4. Else → DENY.
 */

export function isNegation(node: string): boolean {
  return node.startsWith('!');
}

export function normaliseNode(node: string): string {
  return isNegation(node) ? node.slice(1) : node;
}

/**
 * Does `grant` (a positive pattern) match the query node?
 *
 *   match('*',           'anything')            → true
 *   match('users.edit',  'users.edit')          → true
 *   match('users.edit.*','users.edit.delete')   → true
 *   match('users.edit.*','users.edit')          → true  (treat trailing * as ≥ 0)
 *   match('users.*',     'users')               → true
 *   match('users.*',     'roles.edit')          → false
 */
export function matchPattern(grant: string, query: string): boolean {
  if (grant === '*') return true;
  if (!grant.endsWith('.*') && !grant.endsWith('*')) {
    return grant === query;
  }
  // wildcard form
  const prefix = grant.endsWith('.*') ? grant.slice(0, -2) : grant.slice(0, -1);
  if (!prefix) return true;
  return query === prefix || query.startsWith(prefix + '.');
}

/**
 * Evaluate an effective node set against a query.
 * `nodes` may mix positives and negations.
 */
export function can(nodes: readonly string[], query: string): boolean {
  let allow = false;
  for (const node of nodes) {
    if (isNegation(node)) {
      if (matchPattern(node.slice(1), query)) return false;
    } else if (matchPattern(node, query)) {
      allow = true;
    }
  }
  return allow;
}

export function canAll(nodes: readonly string[], queries: readonly string[]): boolean {
  for (const q of queries) if (!can(nodes, q)) return false;
  return true;
}

export function canAny(nodes: readonly string[], queries: readonly string[]): boolean {
  for (const q of queries) if (can(nodes, q)) return true;
  return false;
}
