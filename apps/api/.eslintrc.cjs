module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [".eslintrc.cjs", "dist", "node_modules"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/interface-name-prefix": "off",
    // Denylist guard for accidentally logging sensitive values — see docs/security-design.md §7.
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "CallExpression[callee.object.name=/^(console|logger)$/i] > Identifier[name=/^(password|otp|captcha|secret|privateKey)$/i]",
        message: "Do not log sensitive values directly — see docs/security-design.md §7.",
      },
    ],
  },
};
