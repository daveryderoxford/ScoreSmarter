// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["app/*/index", "app/*"],
              importNames: [
                "AUTH_ROUTES",
                "BOATS_ROUTES",
                "ENTERIES_ROUTES",
                "PUBLISHED_RESULTS_ROUTES",
                "RACE_CALENDER_ROUTES",
                "RESULTS_ENTRY_ROUTES",
                "USER_ROUTES",
              ],
              message:
                "Do not import route arrays from feature barrels; import from the feature *.routes file directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/index.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ExportNamedDeclaration[source.value=/routes|route|presentation|component|dialog|guard|auth-button/]",
          message:
            "Barrel files must not re-export routes/components/pages/dialogs/guards. Export only types/services/utilities.",
        },
      ],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  }
]);
