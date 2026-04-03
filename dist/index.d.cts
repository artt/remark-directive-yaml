import { Root } from 'mdast';

/**
 * remark plugin: parse YAML flow attrs from `:::` directive fence lines and
 * merge them into containerDirective node attributes as properly-typed values.
 *
 * Must be used AFTER remark-parse and remark-directive in the pipeline:
 *   unified().use(remarkParse).use(remarkDirective).use(remarkDirectiveYaml)
 */
declare function remarkDirectiveYaml(this: unknown): (tree: Root) => void;

export { remarkDirectiveYaml };
