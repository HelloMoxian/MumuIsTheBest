import generatedCatalog from "./ui-translations.generated.json";

export type InterfaceLanguageMode = "zh" | "en" | "bilingual";

const MANUAL_TRANSLATIONS: Readonly<Record<string, string>> = {
  中: "Chinese",
  英: "English",
  中英: "Chinese + English",
  无: "Off",
  加: "Addition",
  减: "Subtraction",
  加减: "Mixed",
  题: "questions",
  局: "rounds",
  岁: "years old",
  块: "pieces",
  厘米: "centimeters",
  木木学习岛: "Mumu Learning Island",
  学习大厅: "Learning Hall",
  朗读: "Read aloud",
  界面: "Interface",
  不朗读: "Off",
  中文: "Chinese",
  英文: "English",
  答对啦: "That's right!",
  "答对啦！": "That's right!",
  再想一想: "Think once more",
  "再想一想。": "Think once more.",
  开始: "Start",
  返回: "Back",
  关闭: "Close",
  下一题: "Next question",
  再来一局: "Play another round",
  知识币: "Knowledge Coins",
};

const CATALOG: Readonly<Record<string, string>> = {
  ...(generatedCatalog as Record<string, string>),
  ...MANUAL_TRANSLATIONS,
};

const PLACEHOLDER_PATTERN = /\[\[M(\d+)\]\]/g;
const CHINESE_PATTERN = /\p{Script=Han}/u;
const EXCLUDED_ELEMENT_SELECTOR = [
  "[data-no-ui-translation]",
  "[data-preserve-language]",
  "[aria-hidden='true']",
  "script",
  "style",
  "code",
  "pre",
  "textarea",
].join(",");
const LOCALIZED_ATTRIBUTES = ["aria-label", "title", "placeholder"] as const;

function normalizeSource(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type TemplateTranslation = {
  expression: RegExp;
  english: string;
};

const TEMPLATE_TRANSLATIONS: readonly TemplateTranslation[] = Object.entries(CATALOG)
  .filter(([source]) => source.includes("[[M"))
  .map(([source, english]) => {
    const pieces: string[] = [];
    let cursor = 0;
    for (const match of source.matchAll(PLACEHOLDER_PATTERN)) {
      pieces.push(escapeRegExp(source.slice(cursor, match.index)));
      pieces.push("([\\s\\S]+?)");
      cursor = (match.index ?? 0) + match[0].length;
    }
    pieces.push(escapeRegExp(source.slice(cursor)));
    return { expression: new RegExp(`^${pieces.join("")}$`, "u"), english };
  })
  .sort((left, right) => right.expression.source.length - left.expression.source.length);

function translateTemplate(source: string): string | null {
  for (const template of TEMPLATE_TRANSLATIONS) {
    const match = source.match(template.expression);
    if (!match) continue;
    return template.english.replace(PLACEHOLDER_PATTERN, (_placeholder, rawIndex: string) => (
      match[Number(rawIndex) + 1] ?? ""
    ));
  }
  return null;
}

function translateCommonDynamicText(source: string): string | null {
  let match = source.match(/^第\s*(\d+)\s*\/\s*(\d+)\s*题$/u);
  if (match) return `Question ${match[1]} of ${match[2]}`;
  match = source.match(/^(\d+)\s*题$/u);
  if (match) return `${match[1]} questions`;
  match = source.match(/^(\d+)\s*局$/u);
  if (match) return `${match[1]} rounds`;
  match = source.match(/^(\d+)\s*岁$/u);
  if (match) return `${match[1]} years old`;
  match = source.match(/^(\d+)\s*秒$/u);
  if (match) return `${match[1]} seconds`;
  match = source.match(/^(\d+)\s*分\s*(\d+)\s*秒$/u);
  if (match) return `${match[1]} min ${match[2]} sec`;
  match = source.match(/^正在打开(.+?)…$/u);
  if (match) return `Opening ${translateUiText(match[1])}…`;
  match = source.match(/^数学任务\s*·\s*(.+)$/u);
  if (match) return `Math Mission · ${translateUiText(match[1])}`;
  match = source.match(/^获得\s*(\d+)\s*个知识币/u);
  if (match) return source.includes("现在共有")
    ? `Earned ${match[1]} Knowledge Coins. The new balance is shown above.`
    : `Earned ${match[1]} Knowledge Coins`;
  return null;
}

export function translateUiText(rawSource: string): string {
  const source = normalizeSource(rawSource);
  if (!source || !CHINESE_PATTERN.test(source)) return source;
  if (source.length === 1 && !(source in MANUAL_TRANSLATIONS)) return source;
  return CATALOG[source]
    ?? translateTemplate(source)
    ?? translateCommonDynamicText(source)
    ?? source;
}

export function localizedUiText(
  source: string,
  mode: InterfaceLanguageMode,
  separator = "\n",
): string {
  const normalized = normalizeSource(source);
  if (mode === "zh" || !CHINESE_PATTERN.test(normalized)) return normalized;
  const english = translateUiText(normalized);
  if (english === normalized) return normalized;
  return mode === "en" ? english : `${normalized}${separator}${english}`;
}

type TextRecord = { source: string; output: string; parent: HTMLElement };
type AttributeRecord = { source: string; output: string };

export type DomLocalizer = {
  apply: (mode: InterfaceLanguageMode) => void;
  disconnect: () => void;
};

export function createDomLocalizer(root: HTMLElement): DomLocalizer {
  const textRecords = new WeakMap<Text, TextRecord>();
  const attributeRecords = new WeakMap<Element, Map<string, AttributeRecord>>();
  let activeMode: InterfaceLanguageMode = "zh";
  let applying = false;

  const isExcluded = (element: Element | null) => Boolean(element?.closest(EXCLUDED_ELEMENT_SELECTOR));

  const localizeTextNode = (node: Text) => {
    const parent = node.parentElement;
    if (!parent || isExcluded(parent)) return;
    const current = node.data;
    const existing = textRecords.get(node);
    const source = existing && current === existing.output ? existing.source : current;
    const normalized = normalizeSource(source);
    if (!CHINESE_PATTERN.test(normalized)) return;
    const output = localizedUiText(source, activeMode);
    textRecords.set(node, { source, output, parent });
    if (node.data !== output) node.data = output;
    if (activeMode === "bilingual" && output.includes("\n")) {
      parent.dataset.localizedBilingual = "true";
    } else {
      delete parent.dataset.localizedBilingual;
    }
  };

  const localizeAttributes = (element: Element) => {
    if (isExcluded(element)) return;
    let records = attributeRecords.get(element);
    if (!records) {
      records = new Map();
      attributeRecords.set(element, records);
    }
    for (const attribute of LOCALIZED_ATTRIBUTES) {
      const current = element.getAttribute(attribute);
      if (!current || !CHINESE_PATTERN.test(current)) continue;
      const existing = records.get(attribute);
      const source = existing && current === existing.output ? existing.source : current;
      const output = localizedUiText(source, activeMode, " / ");
      records.set(attribute, { source, output });
      if (current !== output) element.setAttribute(attribute, output);
    }
  };

  const localizeTree = (start: Node) => {
    if (start.nodeType === Node.TEXT_NODE) {
      localizeTextNode(start as Text);
      return;
    }
    if (!(start instanceof Element) || isExcluded(start)) return;
    localizeAttributes(start);
    const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current: Node | null;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) localizeTextNode(current as Text);
      else localizeAttributes(current as Element);
    }
  };

  const observer = new MutationObserver((mutations) => {
    if (applying) return;
    applying = true;
    try {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeTextNode(mutation.target as Text);
        if (mutation.type === "attributes") localizeAttributes(mutation.target as Element);
        mutation.addedNodes.forEach(localizeTree);
      }
    } finally {
      applying = false;
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...LOCALIZED_ATTRIBUTES],
  });

  return {
    apply(mode) {
      activeMode = mode;
      root.dataset.uiLanguage = mode;
      applying = true;
      try {
        localizeTree(root);
      } finally {
        applying = false;
      }
    },
    disconnect() {
      observer.disconnect();
    },
  };
}
