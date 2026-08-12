const { copyFileSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");

const runtimeAssets = [
  "alarm.mp3",
  "anchor_get.png",
  "bgm.mp3",
  "map.glb",
  "player.glb",
  "wake_foam.png",
  "waternormals.jpg",
];

module.exports = {
  base: "/",
  build: {
    outDir: "docs",
  },
  plugins: [
    {
      name: "copy-runtime-assets",
      writeBundle() {
        const outputDirectory = resolve(__dirname, "docs");
        mkdirSync(outputDirectory, { recursive: true });
        runtimeAssets.forEach((asset) =>
          copyFileSync(resolve(__dirname, asset), resolve(outputDirectory, asset)),
        );
      },
    },
  ],
};
