// يمنع عناصر الإدخال الأصلية التي لا يمكن تخصيص مظهرها أو سلوكها بالكامل (DECISIONS 2026-10-10).
const BANNED_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "checkbox",
  "radio",
  "number",
  "range",
  "color",
  "select",
]);

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: { description: "منع select وdatalist وحقول input الأصلية غير النصية" },
    messages: {
      element: "<{{name}}> أصلي ممنوع. استخدم المكوّن المخصص من src/shared/fields.",
      inputType: '<input type="{{type}}"> ممنوع. استخدم المكوّن المخصص من src/shared/fields.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const name = node.name.name;
        if (name === "select" || name === "datalist" || name === "option") {
          context.report({ node, messageId: "element", data: { name } });
          return;
        }
        if (name !== "input") return;
        const typeAttr = node.attributes.find(
          (a) => a.type === "JSXAttribute" && a.name && a.name.name === "type",
        );
        if (!typeAttr || !typeAttr.value) return;
        const v = typeAttr.value;
        const type =
          v.type === "Literal"
            ? String(v.value)
            : v.type === "JSXExpressionContainer" && v.expression.type === "Literal"
              ? String(v.expression.value)
              : null;
        if (type && BANNED_INPUT_TYPES.has(type.toLowerCase())) {
          context.report({ node, messageId: "inputType", data: { type } });
        }
      },
    };
  },
};
