import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * «رسم الخط» للأيقونات (الخيار ٤أ، DECISIONS 2026-10-11): كل مسار بطول منسوب 1 فيُرسم كاملاً بنفس المدة،
 * والمسار متعدد الأجزاء (عدة M) يُقسم كي تُرسم أجزاؤه معاً لا واحداً بعد الآخر. الحركة نفسها في global.css.
 */
export function splitPath(d: string): string[] {
  return d
    .split(/(?=[Mm])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const SHAPES = new Set(["path", "rect", "circle", "line", "polyline", "polygon", "ellipse"]);

export function drawable(node: ReactNode): ReactNode {
  return Children.map(node, (child): ReactNode => {
    if (!isValidElement(child)) return child;
    const el = child as ReactElement<{ d?: string; children?: ReactNode; pathLength?: number }>;
    if (typeof el.type !== "string") return cloneElement(el, {}, drawable(el.props.children));
    if (el.type === "path" && el.props.d) {
      const parts = splitPath(el.props.d);
      if (parts.length > 1) return parts.map((d, i) => cloneElement(el, { d, pathLength: 1, key: i }));
    }
    if (SHAPES.has(el.type)) return cloneElement(el, { pathLength: 1 });
    return el.props.children ? cloneElement(el, {}, drawable(el.props.children)) : el;
  });
}
