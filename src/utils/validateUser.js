function validateTransformedUser(obj = {}) {
  const errors = [];

  const hasAnyProviderId = !!(obj.googleId);
  const hasEmail = typeof obj.email === 'string' && obj.email.trim() !== '';

  if (!hasAnyProviderId && !hasEmail) {
    errors.push("Transformed user must include at least one provider id or a valid email.");
  }

  if ('name' in obj && typeof obj.name !== 'string') {
    errors.push("Field 'name' must be a string if provided.");
  }
  if ('profilePic' in obj && typeof obj.profilePic !== 'string') {
    errors.push("Field 'profilePic' must be a string if provided.");
  }
  if ('roles' in obj && !Array.isArray(obj.roles)) {
    errors.push("Field 'roles' must be an array of strings if provided.");
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateTransformedUser };
