const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const ARTIFACT_ROOT = path.join(
  ROOT_DIR,
  "test-results",
  "buscommand-e2e-evidence"
);

function artifactPath(...segments) {
  fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });
  return path.join(ARTIFACT_ROOT, ...segments);
}

function artifactDirectory(...segments) {
  const directory = artifactPath(...segments);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

module.exports = {
  artifactDirectory,
  artifactPath
};
