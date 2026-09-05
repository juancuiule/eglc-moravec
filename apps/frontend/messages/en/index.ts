// Merges every namespace file for this locale into the one messages object
// next-intl needs. Adding a namespace is just: drop a same-named
// messages/en/<name>.json + messages/es/<name>.json, then add the two
// import/export lines here and in ../es/index.ts — nothing else to wire up.
import common from "./common.json";
import home from "./home.json";
import errors from "./errors.json";
import auth from "./auth.json";
import levels from "./levels.json";
import practice from "./practice.json";
import stats from "./stats.json";
import tutorials from "./tutorials.json";

export default {
  Common: common,
  Home: home,
  Errors: errors,
  Auth: auth,
  Levels: levels,
  Practice: practice,
  Stats: stats,
  Tutorials: tutorials,
};
