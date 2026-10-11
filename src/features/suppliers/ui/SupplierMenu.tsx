import { Button, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import type { NamedSupplier } from "../core/suppliers";
import s from "./SupplierMenu.module.css";

/** قائمة «⋯» في رأس كشف المورد (الخيار ب): تعديل الاسم والأرشفة، للمالك والإدارة. */
export function SupplierMenu(p: { supplier: NamedSupplier; onRename: () => void; onArchive: () => void }) {
  return (
    <MenuTrigger>
      <Button className={s.trigger} aria-label={`إجراءات المورد ${p.supplier.name}`}>
        <span aria-hidden="true">⋯</span>
      </Button>
      <Popover className={s.pop} placement="bottom end">
        <Menu
          className={s.menu}
          onAction={(k) => {
            if (k === "rename") p.onRename();
            else p.onArchive();
          }}
        >
          <MenuItem id="rename" className={s.item}>
            تعديل الاسم
          </MenuItem>
          <MenuItem id="archive" className={s.item}>
            {p.supplier.archived ? "إعادة تنشيط المورد" : "أرشفة المورد"}
          </MenuItem>
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
