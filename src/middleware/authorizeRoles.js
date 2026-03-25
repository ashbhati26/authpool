/**
 * Role-based access control middleware.
 * @param {string[]} required - roles that are allowed
 */
function authorizeRoles(required = []) {
  const requiredSet = new Set((required || []).map((r) => String(r).toLowerCase()));
  return (req, res, next) => {
    const roles = Array.isArray(req.user?.roles)
      ? req.user.roles.map((r) => String(r).toLowerCase())
      : [];
    if (roles.some((r) => requiredSet.has(r))) return next();
    return res.status(403).json({ error: "Forbidden: insufficient role" });
  };
}

module.exports = { authorizeRoles };