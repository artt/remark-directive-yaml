import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import type { Root } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'
import type { VFile } from 'vfile'

/**
 * Find the outermost {...} span on a line, handling nested braces.
 */
function extractFlowAttrs(line: string): string | null {
  const start = line.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < line.length; i++) {
    if (line[i] === '{') depth++
    else if (line[i] === '}') {
      depth--
      if (depth === 0) return line.slice(start, i + 1)
    }
  }
  return null // unmatched brace
}

/**
 * Parse YAML flow attrs from all directive fence lines in a document.
 * Returns:
 * - cleaned: source with {yaml} blocks removed so remark-directive can tokenize cleanly
 * - attrsByLine: 1-indexed line → parsed YAML attrs
 */
function preprocessSource(doc: string): {
  cleaned: string
  attrsByLine: Map<number, Record<string, unknown>>
} {
  const lines = doc.split('\n')
  const attrsByLine = new Map<number, Record<string, unknown>>()

  const cleaned = lines
    .map((line, i) => {
      if (!/^\s*:{3,}/.test(line)) return line

      const attrStr = extractFlowAttrs(line)
      if (!attrStr) return line

      try {
        const parsed = parseYaml(attrStr) as unknown
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
        ) {
          attrsByLine.set(i + 1, parsed as Record<string, unknown>)
          return line.replace(attrStr, '').trimEnd()
        }
      } catch {
        // Not valid YAML — leave line unchanged
      }
      return line
    })
    .join('\n')

  return { cleaned, attrsByLine }
}

/**
 * remark plugin: parse YAML flow attrs from `:::` directive fence lines and
 * merge them into containerDirective node attributes as properly-typed values.
 *
 * Recommended pipeline:
 *   unified().use(remarkParse).use(remarkDirective).use(remarkDirectiveYaml)
 */
export function remarkDirectiveYaml(this: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = this as any

  // attrsByLine is populated during parsing and consumed during transform.
  let attrsByLine = new Map<number, Record<string, unknown>>()

  // Wrap the parser so we can strip {yaml} attrs from fence lines before
  // remark-directive's micromark tokenizer sees them. This is necessary
  // because remark-directive doesn't handle YAML flow mapping syntax
  // (colons as separators, commas between entries).
  //
  // In some environments (Astro MDX, custom processors) proc.parser may not
  // be set at plugin-attach time. We skip the wrapping gracefully; the
  // transformer fallback below reads attrs directly from the file instead.
  const parserKey: 'parser' | 'Parser' | null =
    proc.parser ? 'parser' : proc.Parser ? 'Parser' : null

  if (parserKey) {
    const OriginalParser = proc[parserKey] as (...args: unknown[]) => Root
    proc[parserKey] = function (...args: unknown[]) {
      const { cleaned, attrsByLine: map } = preprocessSource(String(args[0]))
      attrsByLine = map
      args[0] = cleaned
      return OriginalParser(...args)
    }
  }

  // Transformer: merge parsed YAML attrs into each containerDirective node.
  return (tree: Root, file: VFile) => {
    // Fallback for environments where parser wrapping didn't run:
    // parse attrs from the raw file source here in the transformer.
    if (attrsByLine.size === 0) {
      const { attrsByLine: map } = preprocessSource(String(file))
      attrsByLine = map
    }

    visit(tree, 'containerDirective', (node: ContainerDirective) => {
      if (!node.position) return
      const attrs = attrsByLine.get(node.position.start.line)
      if (!attrs) return
      // Intentionally storing typed values (boolean, number, string) even
      // though mdast-util-directive types attributes as Record<string, string>.
      ;(node as { attributes: Record<string, unknown> }).attributes = {
        ...(node.attributes ?? {}),
        ...attrs,
      }
    })

    // Reset so the same processor instance can be reused across files.
    attrsByLine = new Map()
  }
}
