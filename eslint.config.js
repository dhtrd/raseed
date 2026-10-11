import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";
import noNativeControls from "./tools/eslint/no-native-controls.js";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "rased-mockups",
      "proposals",
      "reports",
      "private",
      "data",
      "coverage",
      "playwright-report",
      "playwright-report-auth",
      "test-results",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser }, ecmaVersion: 2022, sourceType: "module" },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      raseed: { rules: { "no-native-controls": noNativeControls } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "raseed/no-native-controls": "error",
      "no-alert": "error",
      "no-console": ["error", { allow: ["error", "warn"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // لا innerHTML: كل المخرجات عبر React (تطهير تلقائي)
      "no-restricted-properties": ["error", { property: "innerHTML", message: "ممنوع: استخدم React." }],
    },
  },
  {
    files: ["tools/**/*.js", "*.config.{js,ts}", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // سكربتات المالك في الطرفية: الطباعة هي واجهتها
    files: ["tools/admin/**/*.ts", "tools/migrate/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
);
