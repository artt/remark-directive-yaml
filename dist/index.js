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
  let attrsByLine = /* @__PURE__ */ new Map();
  const parserKey = proc.parser ? "parser" : proc.Parser ? "Parser" : null;
  if (parserKey) {
    const OriginalParser = proc[parserKey];
    proc[parserKey] = function(...args) {
      const { cleaned, attrsByLine: map } = preprocessSource(String(args[0]));
      attrsByLine = map;
      args[0] = cleaned;
      return OriginalParser(...args);
    };
  }
  return (tree, file) => {
    if (attrsByLine.size === 0) {
      const { attrsByLine: map } = preprocessSource(String(file));
      attrsByLine = map;
    }
    visit(tree, "containerDirective", (node) => {
      if (!node.position) return;
      const attrs = attrsByLine.get(node.position.start.line);
      if (!attrs) return;
      node.attributes = {
        ...node.attributes ?? {},
        ...attrs
      };
    });
    attrsByLine = /* @__PURE__ */ new Map();
  };
}
export {
  remarkDirectiveYaml
};
