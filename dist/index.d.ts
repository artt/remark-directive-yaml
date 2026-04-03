import { Root } from 'mdast';
import { VFile } from 'vfile';

/**
 * remark plugin: parse YAML flow attrs from `:::` directive fence lines and
 * merge them into containerDirective node attributes as properly-typed values.
 *
 * Recommended pipeline:
 *   unified().use(remarkParse).use(remarkDirective).use(remarkDirectiveYaml)
 */
declare function remarkDirectiveYaml(this: unknown): (tree: Root, file: VFile) => void;

export { remarkDirectiveYaml };
