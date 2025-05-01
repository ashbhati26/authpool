const GoogleStrategy = require('passport-google-oauth20').Strategy;
const passport = require('passport');
const User = require('../models/User');

const initPassport = (clientID, clientSecret, callbackURL) => {
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        const { id, displayName, photos, emails } = profile;
        let user = await User.findOne({ googleId: id });
        if (!user) {
          user = await User.create({
            googleId: id,
            name: displayName,
            email: emails[0].value,
            profilePic: photos[0].value,
          });
        }
        done(null, user);
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) =>
    User.findById(id).then(user => done(null, user))
  );
};

module.exports = initPassport;
