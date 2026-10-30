import js from "@eslint/js";
import ts from "typescript-eslint";
import react from "eslint-plugin-react";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
export default ts.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ["src/**/*.{ts,tsx}"], plugins: { react, "react-hooks": hooks, "jsx-a11y": a11y }, settings: { react: { version: "detect" } },
    rules: { ...hooks.configs.recommended.rules, ...a11y.configs.recommended.rules, "react-hooks/set-state-in-effect": "off", "react-hooks/refs": "off", "react-hooks/purity": "off", "react-hooks/immutability": "off", "react-hooks/exhaustive-deps": "warn", "jsx-a11y/no-static-element-interactions": "off", "jsx-a11y/click-events-have-key-events": "off", "jsx-a11y/no-noninteractive-element-interactions": "off" } }
);
