import { useMemo, useState } from "react";
import {
  ComboBox,
  Header,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
} from "react-aria-components";
import { formatDate, normalizeForSearch, type IsoDate } from "../core";
import f from "./Field.module.css";
import s from "./SupplierCombobox.module.css";

export type SupplierOption = { id: string; name: string; lastEntryDate?: IsoDate | null };

export type SupplierComboboxProps = {
  suppliers: SupplierOption[];
  /** معرّفات المستخدمة مؤخراً بالترتيب (DECISIONS 2026-10-10: «الأخيرة أولاً») */
  recentIds?: string[];
  value: string | null;
  onChange: (id: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
};

const matches = (name: string, q: string) => normalizeForSearch(name).includes(normalizeForSearch(q.trim()));

/** قائمة بحث مخصصة: اختيار من القائمة فقط، والنص الحر يُرفض برسالة عند الخروج. */
export function SupplierCombobox(p: SupplierComboboxProps) {
  const selected = p.suppliers.find((x) => x.id === p.value) ?? null;
  const [input, setInput] = useState(selected?.name ?? "");
  const [own, setOwn] = useState<string | null>(null);

  const { recent, rest } = useMemo(() => {
    const q = input.trim();
    const filtered = p.suppliers.filter((x) => !q || (selected && q === selected.name) || matches(x.name, q));
    const rec =
      q && !(selected && q === selected.name)
        ? []
        : (p.recentIds ?? [])
            .map((id) => filtered.find((x) => x.id === id))
            .filter((x): x is SupplierOption => Boolean(x));
    const others = filtered
      .filter((x) => !rec.includes(x))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return { recent: rec, rest: others };
  }, [input, p.suppliers, p.recentIds, selected]);

  const error = own ?? p.error ?? null;
  const item = (x: SupplierOption) => (
    <ListBoxItem key={x.id} id={x.id} textValue={x.name} className={s.item}>
      <span>{x.name}</span>
      {x.lastEntryDate ? (
        <span className={s.last}>
          آخر حركة <span className="num">{formatDate(x.lastEntryDate)}</span>
        </span>
      ) : null}
    </ListBoxItem>
  );

  return (
    <ComboBox
      className={`${f.field} ${error ? f.error : ""} ${p.disabled ? f.disabled : ""}`}
      selectedKey={p.value}
      inputValue={input}
      onInputChange={(v) => {
        setOwn(null);
        setInput(v);
        if (selected && v !== selected.name) p.onChange(null);
      }}
      onSelectionChange={(key) => {
        const x = p.suppliers.find((y) => y.id === key);
        p.onChange(x ? x.id : null);
        if (x) {
          setInput(x.name);
          setOwn(null);
        }
      }}
      allowsCustomValue
      menuTrigger="focus"
      defaultFilter={() => true}
      isDisabled={p.disabled}
      isInvalid={Boolean(error)}
      onBlur={() => {
        const q = input.trim();
        if (!q) return setOwn(p.required ? "اختر المورد من القائمة." : null);
        const exact = p.suppliers.find((x) => normalizeForSearch(x.name) === normalizeForSearch(q));
        if (exact) {
          p.onChange(exact.id);
          setInput(exact.name);
          return setOwn(null);
        }
        if (!selected) setOwn(`«${q}» ليس مورداً مسنداً لك. اختر من القائمة.`);
      }}
    >
      <Label className={f.label}>
        المورد {p.required ? <span className={f.required}>مطلوب</span> : null}
        <span className={s.count}>{p.suppliers.length} مورداً متاحاً لك</span>
      </Label>
      <div className={f.box}>
        <Input className={f.input} placeholder="اكتب جزءاً من الاسم" />
      </div>
      {error ? (
        <span className={f.message} role="alert">
          {error}
        </span>
      ) : null}
      <Popover className={s.popover} placement="bottom start" offset={2}>
        <ListBox
          className={s.list}
          renderEmptyState={() => <div className={s.empty}>لا يوجد مورد مسند لك بهذا الاسم.</div>}
        >
          {recent.length ? (
            <ListBoxSection>
              <Header className={s.header}>المستخدمون مؤخراً</Header>
              {recent.map(item)}
            </ListBoxSection>
          ) : null}
          {rest.length ? (
            <ListBoxSection>
              {recent.length ? <Header className={s.header}>كل الموردين</Header> : null}
              {rest.map(item)}
            </ListBoxSection>
          ) : null}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
