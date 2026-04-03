"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  remarkDirectiveYaml: () => remarkDirectiveYaml
});
module.exports = __toCommonJS(index_exports);
var import_unist_util_visit = require("unist-util-visit");
var import_yaml = require("yaml");
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
      const parsed = (0, import_yaml.parse)(attrStr);
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
    (0, import_unist_util_visit.visit)(tree, "containerDirective", (node) => {
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  remarkDirectiveYaml
});
