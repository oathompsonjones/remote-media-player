// @ts-check
import createConfig from "@oathompsonjones/eslint-config";

const config = createConfig({
    configs: [
        { ignores: ["dist/**"] },
        { rules: { "prefer-named-capture-group": "off", "require-unicode-regexp": "off" } },
    ],
});

export default [
    ...config,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.json"],
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
];
