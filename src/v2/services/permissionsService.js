import dbTurso from '../../database/db-sqlite.js';

const CACHE_TTL_MS = 30 * 1000;

const rolePermissionsCache = new Map();
const userPermissionsCache = new Map();

const hasFresh = (entry) => entry && (Date.now() - entry.cachedAt) < CACHE_TTL_MS;

const normalizeRole = (role) => (role || '').toLowerCase().trim();

export function clearUserPermissionCache(userId) {
  userPermissionsCache.delete(Number(userId));
}

export function clearRolePermissionCache(role) {
  rolePermissionsCache.delete(normalizeRole(role));
}

export async function getPermissionCatalog() {
  const result = await dbTurso.execute({
    sql: `
      SELECT permission_key, module, action, description
      FROM permissions_catalog
      WHERE is_active = 1
      ORDER BY module, action
    `
  });

  return result.rows.map((row) => ({
    key: row.permission_key,
    module: row.module,
    action: row.action,
    description: row.description
  }));
}

export async function getRolePermissions(role) {
  const normalizedRole = normalizeRole(role);
  const cached = rolePermissionsCache.get(normalizedRole);
  if (hasFresh(cached)) return cached.permissions;

  const result = await dbTurso.execute({
    sql: `
      SELECT rp.permission_key
      FROM role_permissions rp
      JOIN permissions_catalog pc ON pc.permission_key = rp.permission_key
      WHERE rp.role = ? AND pc.is_active = 1
    `,
    args: [normalizedRole]
  });

  const permissions = new Set(result.rows.map((r) => r.permission_key));
  rolePermissionsCache.set(normalizedRole, { permissions, cachedAt: Date.now() });

  return permissions;
}

export async function getUserPermissionOverrides(userId) {
  const uid = Number(userId);
  const result = await dbTurso.execute({
    sql: `
      SELECT upo.permission_key, upo.effect
      FROM user_permission_overrides upo
      JOIN permissions_catalog pc ON pc.permission_key = upo.permission_key
      WHERE upo.user_id = ? AND pc.is_active = 1
    `,
    args: [uid]
  });

  const allow = new Set();
  const deny = new Set();

  result.rows.forEach((row) => {
    if (row.effect === 'allow') allow.add(row.permission_key);
    if (row.effect === 'deny') deny.add(row.permission_key);
  });

  return { allow, deny };
}

export async function getEffectivePermissionsForUser(userId, role) {
  const uid = Number(userId);
  const cacheKey = uid;
  const cached = userPermissionsCache.get(cacheKey);

  if (hasFresh(cached) && cached.role === normalizeRole(role)) {
    return cached.effective;
  }

  const rolePermissions = await getRolePermissions(role);
  const overrides = await getUserPermissionOverrides(uid);

  const effective = new Set(rolePermissions);

  overrides.deny.forEach((key) => effective.delete(key));
  overrides.allow.forEach((key) => effective.add(key));

  userPermissionsCache.set(cacheKey, {
    role: normalizeRole(role),
    effective,
    cachedAt: Date.now()
  });

  return effective;
}

export async function userHasPermission(userId, role, permissionKey) {
  if (normalizeRole(role) === 'superadmin') {
    return true;
  }

  const effective = await getEffectivePermissionsForUser(userId, role);
  return effective.has(permissionKey);
}

export async function setUserPermissionOverrides({ userId, updatedBy, overrides }) {
  const uid = Number(userId);
  const updater = Number(updatedBy);

  await dbTurso.execute({
    sql: `DELETE FROM user_permission_overrides WHERE user_id = ?`,
    args: [uid]
  });

  for (const item of overrides) {
    await dbTurso.execute({
      sql: `
        INSERT INTO user_permission_overrides (user_id, permission_key, effect, updated_by)
        VALUES (?, ?, ?, ?)
      `,
      args: [uid, item.key, item.effect, updater]
    });
  }

  clearUserPermissionCache(uid);
}

export async function buildUserPermissionsSnapshot(userId, role) {
  const catalog = await getPermissionCatalog();
  const rolePermissions = await getRolePermissions(role);
  const overrides = await getUserPermissionOverrides(userId);
  const effective = await getEffectivePermissionsForUser(userId, role);

  return catalog.map((perm) => {
    const inRole = rolePermissions.has(perm.key);
    const isAllowedByOverride = overrides.allow.has(perm.key);
    const isDeniedByOverride = overrides.deny.has(perm.key);

    let source = 'none';
    if (isDeniedByOverride) source = 'override_deny';
    else if (isAllowedByOverride) source = 'override_allow';
    else if (inRole) source = 'role';

    return {
      ...perm,
      granted: effective.has(perm.key),
      source,
      override: isAllowedByOverride ? 'allow' : (isDeniedByOverride ? 'deny' : null)
    };
  });
}
