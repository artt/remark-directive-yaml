import { visit } from 'unist-util-visit'
import { parse as parseYaml } from 'yaml'
import type { Root } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'

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
 * Strip YAML flow attrs from directive fence lines so remark-directive can
 * tokenize them cleanly. Returns:
 * - cleaned: the source with `{...}` removed from fence lines
 * - attrsByLine: 1-indexed line → parsed YAML attrs map
 */
function preprocessSource(doc: string): {
  cleaned: string
  attrsByLine: Map<number, Record<string, unknown>>
} {
  const lines = doc.split('\n')
  const attrsByLine = new Map<number, Record<string, unknown>>()

  const cleaned = lines
    .map((line, i) => {
      // Only act on directive fence lines (optional leading whitespace, then :::)
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
          // Remove the {yaml} block from the line (remark-directive gets a clean fence)
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
 * Must be used AFTER remark-parse and remark-directive in the pipeline:
 *   unified().use(remarkParse).use(remarkDirective).use(remarkDirectiveYaml)
 */
export function remarkDirectiveYaml(this: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proc = this as any

  // Wrap the parser set up by remark-parse so we can preprocess the source
  // before micromark (and remark-directive's extension) tokenizes it.
  // unified v11 uses `parser` (lowercase); `Parser` (uppercase) is deprecated.
  const parserKey = 'parser' in proc && proc.parser ? 'parser' : 'Parser'
  const OriginalParser = proc[parserKey] as
    | ((...args: unknown[]) => Root)
    | undefined

  if (!OriginalParser) {
    throw new Error(
      'remarkDirectiveYaml: remark-parse must be used before this plugin'
    )
  }

  // attrsByLine is written during parse and read during transform.
  // Sequential processing is safe; concurrent calls to the same processor
  // would need per-file state (not addressed in step 1).
  let attrsByLine = new Map<number, Record<string, unknown>>()

  proc[parserKey] = function (...args: unknown[]) {
    const doc = args[0]
    const { cleaned, attrsByLine: map } = preprocessSource(String(doc))
    attrsByLine = map
    args[0] = cleaned
    return OriginalParser(...args)
  }

  // Transformer: apply the stored YAML attrs to containerDirective nodes.
  return (tree: Root) => {
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
  }
}
