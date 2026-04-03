# remark-directive-yaml

A remark plugin for structured content blocks in Markdown using `:::` fenced syntax with YAML attributes.

## Overview

`remark-directive-yaml` extends Markdown with fenced container blocks that carry structured metadata. It parses `:::` fences into MDAST nodes that downstream plugins and renderers (including MDX component mappings) can consume.

This plugin handles **declarative content structure only** — figures, callouts, quotes, asides, details blocks. It does not handle citations, cross-references, or interactive behavior. Those are separate concerns for separate plugins.

### Design principles

1. **One attribute language.** All metadata is YAML — flow mappings on the fence line, block mappings as internal frontmatter. No second mini-language.
2. **Progressive complexity.** A block can be a one-liner, have a frontmatter header, or contain nested children. The author reaches for exactly as much syntax as needed.
3. **Recursive grammar.** A `figure` inside a `figure` is a subfigure. The syntax is identical at every nesting level; context determines semantics.
4. **MDX compatibility.** Parsed AST nodes map directly to the component names that MDX uses. A `:::figure` and an `<Figure>` resolve to the same component.
5. **Graceful degradation.** Documents using `:::` blocks remain human-readable without any tooling.

---

## Syntax

### Formal grammar

```
FENCED_BLOCK  := OPEN_FENCE NL [FRONTMATTER] [CONTENT] CLOSE_FENCE
               | SELF_CLOSED

OPEN_FENCE    := COLONS SP TYPE [SP ID_BRACKET] [SP FLOW_ATTRS]
CLOSE_FENCE   := COLONS
SELF_CLOSED   := COLONS SP TYPE [SP ID_BRACKET] [SP FLOW_ATTRS] SP COLONS

COLONS        := ":::" ":"*              # 3 or more colons
TYPE          := [a-zA-Z][a-zA-Z0-9-]*   # block type identifier
ID_BRACKET    := "[" ID "]"
ID            := [a-zA-Z][a-zA-Z0-9_-]*  # no spaces, no special chars
FLOW_ATTRS    := "{" YAML_FLOW_MAPPING "}"
FRONTMATTER   := "---" NL YAML_BLOCK NL "---" NL
CONTENT       := (MARKDOWN_BLOCK | FENCED_BLOCK)*
SP            := " "+
NL            := newline
```

### Fence line

The opening fence line consists of, in order:

1. **Colons** — three or more `:` characters.
2. **Type** — a block type identifier (required).
3. **ID bracket** — `[my-id]` (optional). Sugar for `{id: my-id}`.
4. **Flow attributes** — `{key: val, key: val}` (optional). YAML flow mapping syntax.

```
::: callout {type: warning}
```

```
::: figure [fig-results] {src: chart.png, caption: Results}
```

The closing fence is a line containing only colons (≥ 3), matching or fewer than the opening fence's colon count.

### Self-closing form

If the opening fence line ends with `:::` (or more colons), the block is self-closed. No content, no separate closing fence.

```
::: figure [fig-x] {src: plot.svg, caption: Results} :::
```

This is syntactic sugar for:

```
::: figure [fig-x] {src: plot.svg, caption: Results}
:::
```

Use only when a block has no body content and all metadata fits in flow attrs.

### Internal frontmatter

A `---`-delimited YAML block mapping may appear as the first non-blank content inside a fenced block. It provides structured metadata for cases where flow attrs on the fence line are insufficient (multiline values, nested structures, many keys).

```
::: figure [fig-pipeline]
---
caption: |
  **Fig 3.** Data flows left-to-right through
  the three processing stages.
source: J. Torres, 2025
width: 100%
---
:::
```

**Parsing rule:** The frontmatter opening `---` must be the first non-blank line after the opening fence. The closing `---` terminates the frontmatter. Everything after the closing `---` is content. Any subsequent `---` in the content is treated as a Markdown horizontal rule (thematic break), not as frontmatter.

**Precedence:** If the same key appears in both flow attrs and frontmatter, frontmatter wins. However, this SHOULD be treated as a warning by implementations.

**ID resolution:** If both `[id]` on the fence line and `id:` in attrs/frontmatter are present, it is an error. Implementations SHOULD emit a warning and use the `[id]` value.

### Nesting

Outer fences use more colons than inner fences. The closing fence matches the nearest open fence with the same or fewer colons.

```
::::: figure [fig-all]
---
caption: All results
---

  ::: figure [fig-a] {src: a.png, caption: Method A}
  :::

  :::: figure [fig-b]
  ---
  caption: |
    Method B, with extended description
    spanning multiple lines.
  ---
  ![Method B visualization](b.png)
  ::::

:::::
```

**Minimum colons:** An inner fence must use strictly fewer colons than its immediately enclosing fence. A fence with N colons can only be opened inside a fence with N+1 or more colons.

### Cosmetic indentation

Inside a fenced block, leading whitespace on child fence lines and their content is **stripped by the parser**. Indentation is purely cosmetic — it does not affect nesting depth (colon count determines that).

```
::::: figure [fig-results] {caption: Results}

  ::: figure [fig-a] {src: a.png, caption: First}
  :::

  ::: figure [fig-b] {src: b.png, caption: Second}
  :::

:::::
```

The above parses identically to the version without indentation. Authors are encouraged to indent nested blocks for readability.

**Rule:** The parser strips up to N characters of leading whitespace from lines inside a fenced block, where N is determined by the indentation of the first non-blank content line. This is similar to how YAML handles block scalars.

### Content model

Content inside a fenced block is full Markdown — paragraphs, emphasis, links, lists, tables, code blocks, images, and nested fenced blocks are all valid.

The block type does not change the content grammar. A `callout` and a `figure` parse their content identically. The type affects only semantics and rendering.

**Exception:** No content model for self-closed blocks (they have no content by definition).

---

## Block types

Each block type defines an attribute schema. The parser does not enforce schemas — it passes all attributes through. Schema validation is the concern of renderers or linters.

### `figure`

A figure: an image, table, code block, or any content that is referenced as a unit.

**Attributes:**

| Attribute  | Type     | Description                                           |
|------------|----------|-------------------------------------------------------|
| `id`       | string   | Unique identifier for cross-referencing               |
| `src`      | string   | Path or URL to external resource (image, SVG, etc.)   |
| `alt`      | string   | Alternative text (for `src` images)                   |
| `caption`  | string   | Caption (supports inline Markdown)                    |
| `source`   | string   | Attribution / credit                                  |
| `width`    | string   | Rendering width hint (e.g., `80%`, `600px`)           |
| `position` | string   | Layout hint (`center`, `left`, `right`, `full-width`) |

**Behavior:**

- When `src` is present, the figure is an external resource reference (rendered as `<img>`, `<object>`, etc.).
- When `src` is absent, the block's content *is* the figure body.
- A `figure` nested inside another `figure` is a **subfigure**. Renderers decide layout (side-by-side, grid, numbered as 3a/3b/3c, etc.). No separate `subfigure` type exists.

**Examples:**

One-liner (external image):
```
::: figure [fig-cat] {src: cat.jpg, alt: A cat, caption: A cat on a laptop} :::
```

Content-body figure (table):
```
::: figure [tbl-results] {caption: Accuracy by method}
| Method | Accuracy |
|--------|----------|
| A      | 94.2%    |
| B      | 91.7%    |
:::
```

Subfigures:
```
::::: figure [fig-comparison] {caption: Before and after optimization}

  ::: figure [fig-before] {src: before.png, caption: Before} :::

  ::: figure [fig-after] {src: after.png, caption: After} :::

:::::
```

Mixed subfigures (image + table):
```
::::: figure [fig-full-results] {caption: Experimental results}

  ::: figure [fig-chart] {src: chart.svg, caption: Visual comparison} :::

  :::: figure [tbl-numbers]
  ---
  caption: |
    Numerical results across **five runs**,
    mean ± standard error.
  ---
  | Method | Accuracy      |
  |--------|---------------|
  | A      | 94.2 ± 0.3   |
  | B      | 91.7 ± 0.5   |
  ::::

:::::
```

### `callout`

An admonition or notice block.

**Attributes:**

| Attribute     | Type    | Description                                              |
|---------------|---------|----------------------------------------------------------|
| `type`        | string  | Semantic type: `note`, `tip`, `warning`, `danger`, `example`, `info` |
| `title`       | string  | Override the default title (which is the `type` capitalized) |
| `collapsible` | boolean | Whether the block can be collapsed                       |
| `collapsed`   | boolean | Initial collapsed state (only meaningful if `collapsible: true`) |

**Examples:**

Inline:
```
::: callout {type: warning}
Don't run this in production without reading the full guide.
:::
```

With frontmatter:
```
::: callout
---
type: tip
title: Performance shortcut
collapsible: true
collapsed: true
---
If your dataset fits in memory, skip the streaming
path entirely and use `load_all()`.
:::
```

### `quote`

A block quote with structured attribution. Replaces `>` for quotes that need metadata.

**Attributes:**

| Attribute | Type   | Description                     |
|-----------|--------|---------------------------------|
| `author`  | string | Name of the author              |
| `source`  | string | Title of the work or publication|
| `year`    | string | Year of publication             |
| `url`     | string | Link to the source              |
| `cite`    | string | Citation key (e.g., `smith2020`)|

**Example:**

```
::: quote
---
author: Ada Lovelace
source: Notes on the Analytical Engine
year: 1843
---
The Analytical Engine weaves algebraic patterns
just as the Jacquard loom weaves flowers and leaves.
:::
```

Plain `>` block quotes remain valid Markdown for casual inline quoting where structured attribution is not needed.

### `aside`

Tangential content — margin notes, sidenotes, parenthetical remarks.

**Attributes:**

| Attribute  | Type   | Description                                |
|------------|--------|--------------------------------------------|
| `position` | string | Layout hint: `margin`, `inline`, `footnote`|
| `title`    | string | Optional heading for the aside             |

**Example:**

```
::: aside {position: margin}
This tangent is interesting but not essential to the argument.
:::
```

### `details`

Expandable/collapsible content block.

**Attributes:**

| Attribute | Type    | Description                      |
|-----------|---------|----------------------------------|
| `summary` | string  | The visible summary/toggle text  |
| `open`    | boolean | Initial open/closed state        |

**Example:**

````
::: details {summary: Full error output}
```
TypeError: Cannot read properties of undefined (reading 'map')
    at process (/src/index.js:42:18)
```
:::
````

### Generic (no type)

A bare `:::` with no type is a generic container (a `<div>` equivalent). Useful for styling wrappers.

```
::: {class: two-column}
Content laid out in two columns by CSS.
:::
```

### Custom types

Any identifier is a valid type. The parser does not restrict the type vocabulary. Unrecognized types are passed through as generic container nodes with the type recorded. Renderers can map them to components or ignore them.

```
::: theorem [thm-fundamental] {title: Fundamental Theorem}
Every continuous function on a closed interval is bounded.
:::
```

---

## Extended code fences

Backtick code fences gain optional frontmatter support, using the same `---` delimited YAML block.

````
```python
---
id: code-fib
caption: Fibonacci with memoization
highlight: 4-6
linenos: true
filename: fib.py
---
def fib(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib(n-1) + fib(n-2)
    return memo[n]
```
````

**Parsing rule:** If the first line inside a backtick fence (after the info string) is `---`, the parser treats the content between the first and second `---` as YAML frontmatter for the code block. The remainder is the code content.

**Attributes for code fences:**

| Attribute   | Type    | Description                                   |
|-------------|---------|-----------------------------------------------|
| `id`        | string  | Unique identifier for cross-referencing       |
| `caption`   | string  | Caption displayed with the code block         |
| `highlight` | string  | Line ranges to highlight (e.g., `4-6`, `1,4-6,10`) |
| `linenos`   | boolean | Whether to display line numbers               |
| `filename`  | string  | Displayed filename/path                       |
| `diff`      | boolean | Render as a diff view                         |

**Backward compatibility:** This is backward-compatible with existing Markdown. No existing code block starts with a YAML frontmatter delimiter. Parsers that don't support this extension will render the `---` and YAML as code content, which is an acceptable degradation.

---

## AST output (MDAST)

The plugin produces `containerDirective` nodes conforming to the [mdast-util-directive](https://github.com/syntax-tree/mdast-util-directive) specification. This ensures compatibility with `remark-directive` and MDX component mappings.

### Node shape

```typescript
interface FencedBlock extends Parent {
  type: 'containerDirective'
  name: string                    // block type: 'figure', 'callout', etc.
  attributes: Record<string, any> // merged flow attrs + frontmatter
  children: (PhrasingContent | BlockContent | FencedBlock)[]
}
```

### Examples

Input:
```
::: callout {type: warning}
Don't do this.
:::
```

AST:
```json
{
  "type": "containerDirective",
  "name": "callout",
  "attributes": {
    "type": "warning"
  },
  "children": [
    {
      "type": "paragraph",
      "children": [
        { "type": "text", "value": "Don't do this." }
      ]
    }
  ]
}
```

Input:
```
::: figure [fig-x]
---
caption: A nice chart
source: Torres 2025
---
![Chart](chart.png)
:::
```

AST:
```json
{
  "type": "containerDirective",
  "name": "figure",
  "attributes": {
    "id": "fig-x",
    "caption": "A nice chart",
    "source": "Torres 2025"
  },
  "children": [
    {
      "type": "paragraph",
      "children": [
        {
          "type": "image",
          "url": "chart.png",
          "alt": "Chart"
        }
      ]
    }
  ]
}
```

### MDX component mapping

The AST nodes map to MDX components by name:

```js
// mdx config or provider
export function useMDXComponents() {
  return {
    figure: FigureComponent,
    callout: CalloutComponent,
    quote: QuoteComponent,
    aside: AsideComponent,
    details: DetailsComponent,
  }
}
```

A `:::figure` and `<Figure>` resolve to the same component, receive the same props. Authors choose syntax based on whether they need declarative content (`:::`) or programmatic JSX.

---

## Parsing algorithm

### High-level steps

1. **Tokenize** — Identify opening fences, closing fences, frontmatter delimiters, and content lines.
2. **Match fences** — Pair each closing fence with its nearest unmatched opening fence whose colon count is ≥ the closer's colon count.
3. **Parse frontmatter** — For each matched block, if the first non-blank content line is `---`, extract YAML until the next `---`.
4. **Merge attributes** — Combine flow attrs from the fence line with frontmatter (frontmatter wins on conflicts).
5. **Parse content** — Recursively parse remaining content as Markdown (including nested fenced blocks).
6. **Strip indentation** — Remove cosmetic leading whitespace from nested content.

### Fence matching rules

- A closing fence of N colons closes the nearest open block with ≥ N colons.
- Unmatched opening fences at document end are treated as errors (or the block extends to EOF, implementation-defined).
- A self-closed fence (opening line ending with `:::`) produces a block with no children.

### Integration with remark

This plugin operates at the **micromark** tokenizer level (or as a remark plugin that hooks into the parser). It should run before remark-directive if both are present, or replace it for the container directive case.

Recommended pipeline position:

```
remark-parse → remark-directive-yaml → [other remark plugins] → remark-rehype
```

---

## Relationship to existing tools

| Tool / Spec         | Relationship                                                        |
|---------------------|---------------------------------------------------------------------|
| Pandoc fenced divs  | Borrows `:::` syntax. Adds YAML attrs, frontmatter, self-closing.   |
| remark-directive    | Compatible AST output (`containerDirective`). May replace or extend.|
| MDX                 | Complementary. `:::` for declarative content, JSX for interactive.  |
| Quarto              | Similar goals. This spec is toolchain-agnostic.                     |
| Obsidian callouts   | `:::callout` replaces `> [!type]` with proper structured data.      |
| GitHub alerts       | Same — structured replacement for `> **Note**` hacks.              |

---

## Open questions

- **Should the parser enforce block type schemas?** Current answer: no. The parser is permissive; validation is a separate concern (linter, renderer).
- **Should `:::` without a type be allowed?** Current answer: yes, as a generic container. Some implementations may want to require a type.
- **Error recovery for unclosed fences.** Extend to EOF? Ignore the opening fence? Implementation-defined for now.
- **Code fence frontmatter: opt-in or default?** Could be a separate micro-plugin (`remark-code-frontmatter`) to keep this plugin focused on `:::` blocks only.
