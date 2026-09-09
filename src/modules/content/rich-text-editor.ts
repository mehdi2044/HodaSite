import { isSafeLink } from "./validation";

export type RichTextCommand =
  | "paragraph"
  | "heading2"
  | "heading3"
  | "bold"
  | "italic"
  | "bulletList"
  | "orderedList"
  | "link";

export type InlineCommandPlan = {
  tagName: "strong" | "em" | "a";
  attributes?: Record<string, string>;
};

/** Pure command resolution keeps formatting and link safety independently testable. */
export function resolveInlineCommand(
  command: "bold" | "italic" | "link",
  argument?: string,
): InlineCommandPlan | null {
  if (command === "bold") return { tagName: "strong" };
  if (command === "italic") return { tagName: "em" };
  if (!argument || !isSafeLink(argument)) return null;
  return {
    tagName: "a",
    attributes: { href: argument, rel: "noopener noreferrer" },
  };
}

/**
 * Applies a formatting operation with the standards-based Selection/Range
 * DOM API. Returns the new selection range, or null when the range/argument
 * is invalid. Persisted HTML is still validated and sanitized on the server.
 */
export function applyRichTextCommand(
  editor: HTMLElement,
  range: Range,
  command: RichTextCommand,
  argument?: string,
): Range | null {
  if (
    range.collapsed ||
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  )
    return null;

  const document = editor.ownerDocument;
  let element: HTMLElement;
  if (command === "bold" || command === "italic" || command === "link") {
    const plan = resolveInlineCommand(command, argument);
    if (!plan) return null;
    element = document.createElement(plan.tagName);
    for (const [name, value] of Object.entries(plan.attributes ?? {}))
      element.setAttribute(name, value);
    element.append(range.extractContents());
  } else if (command === "bulletList" || command === "orderedList") {
    element = document.createElement(command === "bulletList" ? "ul" : "ol");
    const text = range.extractContents().textContent ?? "";
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (const line of lines.length > 0 ? lines : [text]) {
      const item = document.createElement("li");
      item.textContent = line;
      element.append(item);
    }
  } else {
    const tags = {
      paragraph: "p",
      heading2: "h2",
      heading3: "h3",
    } as const;
    element = document.createElement(tags[command]);
    const existingBlock = closestEditableBlock(range.startContainer, editor);
    if (existingBlock && existingBlock.contains(range.endContainer)) {
      while (existingBlock.firstChild) element.append(existingBlock.firstChild);
      existingBlock.replaceWith(element);
      const nextRange = document.createRange();
      nextRange.selectNodeContents(element);
      return nextRange;
    }
    element.append(range.extractContents());
  }

  range.insertNode(element);
  const nextRange = document.createRange();
  nextRange.selectNodeContents(element);
  return nextRange;
}

function closestEditableBlock(
  node: Node,
  editor: HTMLElement,
): HTMLElement | null {
  let current: Node | null =
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  while (current && current !== editor) {
    if (
      current instanceof HTMLElement &&
      ["P", "H2", "H3", "DIV", "BLOCKQUOTE"].includes(current.tagName)
    )
      return current;
    current = current.parentNode;
  }
  return null;
}

export function insertPlainTextAtRange(
  editor: HTMLElement,
  range: Range,
  value: string,
): Range | null {
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  )
    return null;
  range.deleteContents();
  const fragment = editor.ownerDocument.createDocumentFragment();
  const lines = value.split(/\r?\n/);
  let lastNode: Node | null = null;
  lines.forEach((line, index) => {
    if (index > 0) {
      const br = editor.ownerDocument.createElement("br");
      fragment.append(br);
      lastNode = br;
    }
    const text = editor.ownerDocument.createTextNode(line);
    fragment.append(text);
    lastNode = text;
  });
  range.insertNode(fragment);
  if (!lastNode) return null;
  const nextRange = editor.ownerDocument.createRange();
  nextRange.setStartAfter(lastNode);
  nextRange.collapse(true);
  return nextRange;
}
