// src/index.ts
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
function extractFlowAttrs(line) {
  const start = line.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < line.length; i++) {
    if (line[i] === "{") depth++;
    else if (line[i] === "}") {
      depth--;
      if (depth === 0) return line.slice(start, i + 1);
    }
  }
  return null;
}
function preprocessSource(doc) {
  const lines = doc.split("\n");
  const attrsByLine = /* @__PURE__ */ new Map();
  const cleaned = lines.map((line, i) => {
    if (!/^\s*:{3,}/.test(line)) return line;
    const attrStr = extractFlowAttrs(line);
    if (!attrStr) return line;
    try {
      const parsed = parseYaml(attrStr);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        attrsByLine.set(i + 1, parsed);
        return line.replace(attrStr, "").trimEnd();
      }
    } catch {
    }
    return line;
  }).join("\n");
  return { cleaned, attrsByLine };
}
function remarkDirectiveYaml() {
  const proc = this;
  const parserKey = "parser" in proc && proc.parser ? "parser" : "Parser";
  const OriginalParser = proc[parserKey];
  if (!OriginalParser) {
    throw new Error(
      "remarkDirectiveYaml: remark-parse must be used before this plugin"
    );
  }
  let attrsByLine = /* @__PURE__ */ new Map();
  proc[parserKey] = function(...args) {
    const doc = args[0];
    const { cleaned, attrsByLine: map } = preprocessSource(String(doc));
    attrsByLine = map;
    args[0] = cleaned;
    return OriginalParser(...args);
  };
  return (tree) => {
    visit(tree, "containerDirective", (node) => {
      if (!node.position) return;
      const attrs = attrsByLine.get(node.position.start.line);
      if (!attrs) return;
      node.attributes = {
        ...node.attributes ?? {},
        ...attrs
      };
    });
  };
}
export {
  remarkDirectiveYaml
};
