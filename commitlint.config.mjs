/**
 * Conventional Commits, with the scopes fixed to the module names in
 * docs/architecture.md §2. A convention is worth adopting only if something
 * checks it - otherwise half the history follows it and the half that does not
 * is the interesting half (CONTRIBUTING.md, "Commits").
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "identity",
        "membership",
        "catalogue",
        "moderation",
        "billing",
        "referrals",
        "notifications",
        "audit",
        "platform",
        "web",
        // Not modules, but real places a change lands.
        "deps",
        "ci",
        "docs",
      ],
    ],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "body-max-line-length": [1, "always", 100],
  },
};
