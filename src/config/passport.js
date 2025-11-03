const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');
const { validateTransformedUser } = require('../utils/validateUser');

/**
 * Initialize providers and support a dynamic transformUser(profile) hook.
 *
 * @param {{
 *   google: {clientID:string, clientSecret:string, callbackURL:string},
 *   transformUser?: (profile: any, provider: 'google') => Record<string, any>
 * }} opts
 */
const initPassport = (opts) => {
  const transformUser = typeof opts.transformUser === 'function' ? opts.transformUser : null;

  async function upsertFromProfile(provider, profile, defaults) {
    const candidate = transformUser ? transformUser(profile, provider) : defaults;

    const { ok, errors } = validateTransformedUser(candidate);
    if (!ok) {
      const msg = `transformUser returned an invalid object: ${errors.join('; ')}`;
      return Promise.reject(new Error(msg));
    }

    let query = null;
    if (candidate[`${provider}Id`]) {
      query = { [`${provider}Id`]: candidate[`${provider}Id`] };
    } else if (candidate.email) {
      query = { email: candidate.email };
    } else {
      query = { _id: null };
    }

    let user = await User.findOne(query);

    if (!user) {
      user = await User.create(candidate);
      return user;
    }

    Object.entries(candidate).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        user[k] = v;
      }
    });
    await user.save();
    return user;
  }

  // ---------- Google (required) ----------
  const g = opts.google;
  passport.use(new GoogleStrategy({
    clientID: g.clientID,
    clientSecret: g.clientSecret,
    callbackURL: g.callbackURL,
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const { id, displayName, photos, emails } = profile;
      const defaults = {
        googleId: id,
        email: emails?.[0]?.value,
        name: displayName,
        profilePic: photos?.[0]?.value,
        roles: ['user'],
      };
      const user = await upsertFromProfile('google', profile, defaults);
      return done(null, user);
    } catch (err) { return done(err); }
  }));

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) =>
    User.findById(id).then(u => done(null, u)).catch(done)
  );
};

module.exports = initPassport;
