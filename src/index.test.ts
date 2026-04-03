import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'
import { VFile } from 'vfile'
import { remarkDirectiveYaml } from './index.js'
import type { ContainerDirective } from 'mdast-util-directive'
import type { Root } from 'mdast'

function parseDirective(md: string): ContainerDirective {
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkDirectiveYaml)

  const file = new VFile(md)
  const tree = processor.parse(file) as Root
  processor.runSync(tree, file)

  const node = tree.children[0]
  if (!node || node.type !== 'containerDirective') {
    throw new Error(`Expected containerDirective, got ${node?.type ?? 'nothing'}`)
  }
  return node as ContainerDirective
}

describe('flow attrs — {key: val} parsing', () => {
  it('single string attr', () => {
    const node = parseDirective(':::callout{type: warning}\n:::')
    expect(node.attributes).toMatchObject({ type: 'warning' })
  })

  it('multiple attrs', () => {
    const node = parseDirective(':::callout{type: warning, title: Watch out}\n:::')
    expect(node.attributes).toMatchObject({ type: 'warning', title: 'Watch out' })
  })

  it('string values stay strings', () => {
    const node = parseDirective(':::figure{caption: Results}\n:::')
    expect(node.attributes).toMatchObject({ caption: 'Results' })
    expect(typeof (node.attributes as Record<string, unknown>)?.caption).toBe('string')
  })

  it('boolean true value', () => {
    const node = parseDirective(':::callout{collapsible: true}\n:::')
    expect((node.attributes as Record<string, unknown>)?.collapsible).toBe(true)
    expect(typeof (node.attributes as Record<string, unknown>)?.collapsible).toBe('boolean')
  })

  it('boolean false value', () => {
    const node = parseDirective(':::callout{collapsed: false}\n:::')
    expect((node.attributes as Record<string, unknown>)?.collapsed).toBe(false)
    expect(typeof (node.attributes as Record<string, unknown>)?.collapsed).toBe('boolean')
  })

  it('numeric integer value', () => {
    const node = parseDirective(':::figure{count: 42}\n:::')
    expect((node.attributes as Record<string, unknown>)?.count).toBe(42)
    expect(typeof (node.attributes as Record<string, unknown>)?.count).toBe('number')
  })

  it('numeric float value', () => {
    const node = parseDirective(':::figure{scale: 1.5}\n:::')
    expect((node.attributes as Record<string, unknown>)?.scale).toBe(1.5)
    expect(typeof (node.attributes as Record<string, unknown>)?.scale).toBe('number')
  })

  it('no attrs — attributes are empty', () => {
    const node = parseDirective(':::callout\n:::')
    const attrs = node.attributes as Record<string, unknown> | null | undefined
    expect(attrs == null || Object.keys(attrs).length === 0).toBe(true)
  })
})
