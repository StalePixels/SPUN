import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Admin code only in the admin area, so no normal page can use it by mistake.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/app/admin/**", "src/lib/admin.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@/lib/admin", message: "Admin code: import it only under src/app/admin/." },
          ],
          patterns: [
            { group: ["**/lib/admin"], message: "Admin code: import it only under src/app/admin/." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (make e2e).
    "e2e/.auth/**",
    "e2e/.results/**",
    "e2e/.report/**",
  ]),
]);

export default eslintConfig;
