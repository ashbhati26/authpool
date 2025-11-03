function authorizeRoles(required = []) {
  const requiredSet = new Set((required || []).map(r => String(r).toLowerCase()));
  return (req, res, next) => {
    const roles = Array.isArray(req.user?.roles) ? req.user.roles.map(r => String(r).toLowerCase()) : [];
    const hasAny = roles.some(r => requiredSet.has(r));
    if (!hasAny) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    return next();
  };
}

module.exports = { authorizeRoles };
