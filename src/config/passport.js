const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { Strategy: LocalStrategy } = require("passport-local");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { validateTransformedUser } = require("../utils/validateUser");

/**
 * @param {{
 *   google?: { clientID: string, clientSecret: string, callbackURL: string },
 *   transformUser?: (profile: any, provider: string) => Record<string, any>
 * }} opts
 */
const initPassport = (opts = {}) => {
  const transformUser = typeof opts.transformUser === "function" ? opts.transformUser : null;

  // ── Shared upsert helper ────────────────────────────────────────────────
  async function upsertFromProfile(provider, profile, defaults) {
    const candidate = transformUser ? transformUser(profile, provider) : defaults;

    const { ok, errors } = validateTransformedUser(candidate);
    if (!ok) throw new Error(`transformUser returned an invalid object: ${errors.join("; ")}`);

    let query;
    if (candidate[`${provider}Id`]) {
      query = { [`${provider}Id`]: candidate[`${provider}Id`] };
    } else if (candidate.email) {
      query = { email: candidate.email };
    } else {
      throw new Error("Cannot upsert user without a provider id or email.");
    }

    let user = await User.findOne(query);
    if (!user) {
      user = await User.create(candidate);
      return user;
    }

    // Merge (don't overwrite password or roles unless explicitly set)
    for (const [k, v] of Object.entries(candidate)) {
      if (v !== undefined && v !== null && k !== "password") {
        user[k] = v;
      }
    }
    await user.save();
    return user;
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────
  if (opts.google?.clientID && opts.google?.clientSecret) {
    const g = opts.google;
    passport.use(
      new GoogleStrategy(
        { clientID: g.clientID, clientSecret: g.clientSecret, callbackURL: g.callbackURL },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const { id, displayName, photos, emails } = profile;
            const defaults = {
              googleId:   id,
              email:      emails?.[0]?.value,
              name:       displayName,
              profilePic: photos?.[0]?.value,
              roles:      ["user"],
            };
            const user = await upsertFromProfile("google", profile, defaults);
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );
  }

  // ── Local (email + password) ─────────────────────────────────────────────
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
        if (!user) return done(null, false, { message: "Invalid email or password." });
        if (!user.password) return done(null, false, { message: "This account uses OAuth — no password set." });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return done(null, false, { message: "Invalid email or password." });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // ── Serialize / deserialize ───────────────────────────────────────────────
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) =>
    User.findById(id).then((u) => done(null, u)).catch(done)
  );
};

module.exports = initPassport;