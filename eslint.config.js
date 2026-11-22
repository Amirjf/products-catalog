import eslint from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import perfectionist from "eslint-plugin-perfectionist";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/*.js"] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  perfectionist.configs["recommended-natural"],
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              message:
                "Only src/migrate.ts runs migrations, as a one-off job before the API starts, so several API instances never race to migrate (ADR-0005).",
              name: "drizzle-orm/node-postgres/migrator",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/migrate.ts", "src/global-setup.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "@typescript-eslint/unbound-method": "off",
    },
  },
);
