import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		globals: false,
		// reporters: ["verbose"],
		onConsoleLog(_log: string) {
			return false;
		},
	},
});
